import { AiError, isAiError } from "./errors";
import { loadRuntime } from "./generate";
import { estimateCostUsd } from "./pricing";
import { asData } from "./prompts/shared";
import type { AiRuntime } from "./runtime";
import { estimateTokens } from "./tokens";
import type {
  CitedStreamEvent,
  CitedTextBlock,
  SearchResultSource,
  TransportMessage,
} from "./transport/types";
import {
  type AiCallContext,
  type AiRunMeta,
  type AiUsageTotals,
  type PromptContext,
  type PromptDefinition,
  ZERO_USAGE,
} from "./types";
import type { AiUsageStatus } from "./usage";

/** Entrada común de los prompts que responden con citas sobre resultados de búsqueda. */
export type CitedPromptInput = {
  question: string;
  history: TransportMessage[];
  results: SearchResultSource[];
};

export type CitedPromptOutput = { blocks: CitedTextBlock[] };

/** Trocea un texto para simular el streaming en modo mock. */
function pieces(text: string): string[] {
  return text.match(/\S+\s*/g) ?? (text ? [text] : []);
}

/**
 * Ejecuta un prompt de respuesta con citas nativas, en streaming. `onEvent`
 * recibe el texto y las citas a medida que llegan. Igual que generateObject:
 * tope de gasto, control de tamaño y registro de uso (también si falla).
 */
export async function streamCitedAnswer<TInput extends CitedPromptInput>(
  prompt: PromptDefinition<TInput, CitedPromptOutput>,
  rawInput: TInput,
  ctx: AiCallContext,
  onEvent: (event: CitedStreamEvent) => void,
  options: { signal?: AbortSignal; runtime?: AiRuntime } = {},
): Promise<{ blocks: CitedTextBlock[]; meta: AiRunMeta }> {
  const input = prompt.input.parse(rawInput);
  const runtime = await loadRuntime(options.runtime);
  const startedAt = Date.now();
  const totals: AiUsageTotals = { ...ZERO_USAGE };
  let costUsd = 0;
  let requestId: string | null = null;
  let model = runtime.model;

  const record = (status: AiUsageStatus, errorCode: string | null = null) =>
    runtime.usage.record({
      orgId: ctx.orgId,
      userId: ctx.userId,
      feature: prompt.feature,
      promptId: prompt.id,
      promptVersion: prompt.version,
      provider: runtime.provider,
      model,
      usage: totals,
      costUsd,
      durationMs: Date.now() - startedAt,
      status,
      attempts: 1,
      errorCode,
      requestId,
    });

  const meta = (usageId: number | null): AiRunMeta => ({
    promptId: prompt.id,
    promptVersion: prompt.version,
    provider: runtime.provider,
    model,
    attempts: 1,
    usage: { ...totals },
    costUsd,
    durationMs: Date.now() - startedAt,
    requestId,
    usageId,
  });

  try {
    const budget = await runtime.budget.check(ctx.orgId);
    if (budget.exceeded) throw new AiError("budget_exceeded");

    const promptContext: PromptContext = {
      country: ctx.country,
      organizationName: ctx.organizationName,
    };
    const system = prompt.system(promptContext);
    const question = prompt.user(input, promptContext);
    // Las preguntas anteriores también son datos aportados por la persona.
    const history: TransportMessage[] = input.history.map((message) =>
      message.role === "user"
        ? { role: "user", content: asData("pregunta", message.content) }
        : message,
    );

    const inputTokens =
      estimateTokens(system) +
      estimateTokens(question) +
      history.reduce((sum, message) => sum + estimateTokens(message.content), 0) +
      input.results.reduce(
        (sum, result) =>
          sum + estimateTokens(result.title) + estimateTokens(result.blocks.join("\n")),
        0,
      );
    const maxInput = prompt.maxInputTokens ?? runtime.maxInputTokens;
    if (inputTokens > maxInput) {
      throw new AiError("input_too_large", { detail: `${inputTokens} tokens > ${maxInput}` });
    }

    if (runtime.provider === "mock" || !runtime.transport) {
      const output = prompt.output.parse(prompt.mock(input, promptContext));
      output.blocks.forEach((block, index) => {
        for (const citation of block.citations)
          onEvent({ type: "citation", block: index, citation });
        for (const text of pieces(block.text)) onEvent({ type: "text", block: index, text });
      });
      return { blocks: output.blocks, meta: meta(await record("ok")) };
    }

    const response = await runtime.transport.streamCited(
      {
        model: runtime.model,
        system,
        history,
        searchResults: input.results,
        question,
        maxTokens: prompt.maxOutputTokens,
        effort: prompt.effort,
        signal: options.signal,
      },
      onEvent,
    );
    totals.inputTokens += response.usage.inputTokens;
    totals.outputTokens += response.usage.outputTokens;
    totals.cacheCreationInputTokens += response.usage.cacheCreationInputTokens;
    totals.cacheReadInputTokens += response.usage.cacheReadInputTokens;
    costUsd += estimateCostUsd(response.model, response.usage);
    requestId = response.requestId;
    model = response.model;

    if (response.stopReason === "refusal") {
      throw new AiError("refused", { detail: `categoría: ${response.refusalCategory ?? "n/d"}` });
    }
    if (response.stopReason === "max_tokens") throw new AiError("truncated");

    return { blocks: response.blocks, meta: meta(await record("ok")) };
  } catch (error) {
    const aiError = isAiError(error) ? error : new AiError("provider_error", { cause: error });
    await record(
      aiError.code === "refused"
        ? "refused"
        : aiError.code === "budget_exceeded"
          ? "budget_exceeded"
          : "error",
      aiError.code,
    );
    throw aiError;
  }
}

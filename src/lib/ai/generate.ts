import { AiError, type AiErrorCode, isAiError } from "./errors";
import { estimateCostUsd } from "./pricing";
import type { AiRuntime } from "./runtime";
import { estimateTokens } from "./tokens";
import type { TransportMessage, TransportResponse } from "./transport/types";
import {
  type AiCallContext,
  type AiRunMeta,
  type AiUsageTotals,
  type PromptContext,
  type PromptDefinition,
  ZERO_USAGE,
} from "./types";
import type { AiUsageStatus } from "./usage";

/** Intentos máximos cuando la salida no pasa la validación Zod. */
const MAX_ATTEMPTS = 2;

function addUsage(totals: AiUsageTotals, usage: AiUsageTotals) {
  totals.inputTokens += usage.inputTokens;
  totals.outputTokens += usage.outputTokens;
  totals.cacheCreationInputTokens += usage.cacheCreationInputTokens;
  totals.cacheReadInputTokens += usage.cacheReadInputTokens;
}

function statusFor(code: AiErrorCode): AiUsageStatus {
  if (code === "refused") return "refused";
  if (code === "invalid_output") return "validation_failed";
  if (code === "budget_exceeded") return "budget_exceeded";
  return "error";
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function describeIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join(".") || "(raíz)"}: ${issue.message}`)
    .join("; ");
}

export async function loadRuntime(runtime?: AiRuntime): Promise<AiRuntime> {
  if (runtime) return runtime;
  // Import dinámico: mantiene este módulo libre de dependencias de servidor
  // (Supabase, variables de entorno) para poder testearlo de forma aislada.
  const { getDefaultRuntime } = await import("./runtime");
  return getDefaultRuntime();
}

type PreparedCall<TInput> = {
  input: TInput;
  promptContext: PromptContext;
  system: string;
  userMessage: string;
};

async function prepare<TInput, TOutput>(
  prompt: PromptDefinition<TInput, TOutput>,
  input: TInput,
  ctx: AiCallContext,
  runtime: AiRuntime,
): Promise<PreparedCall<TInput>> {
  const promptContext: PromptContext = {
    country: ctx.country,
    organizationName: ctx.organizationName,
  };
  const system = prompt.system(promptContext);
  const userMessage = prompt.user(input, promptContext);

  // Control de tokens: estimación local y, si se acerca al límite, conteo exacto.
  const maxInput = prompt.maxInputTokens ?? runtime.maxInputTokens;
  let inputTokens = estimateTokens(system) + estimateTokens(userMessage);
  if (runtime.transport && inputTokens > maxInput / 2) {
    inputTokens = await runtime.transport.countTokens({
      model: runtime.model,
      system,
      messages: [{ role: "user", content: userMessage }],
      maxTokens: prompt.maxOutputTokens,
      effort: prompt.effort,
    });
  }
  if (inputTokens > maxInput) {
    throw new AiError("input_too_large", { detail: `${inputTokens} tokens > ${maxInput}` });
  }

  return { input, promptContext, system, userMessage };
}

/**
 * Ejecuta un prompt con salida estructurada validada con Zod.
 *
 * Orden: validar entrada → tope de gasto → control de tamaño → llamada (con un
 * reintento si la salida no valida) → registro de uso. Toda llamada, con éxito
 * o error, queda registrada en ai_usage.
 */
export async function generateObject<TInput, TOutput>(
  prompt: PromptDefinition<TInput, TOutput>,
  rawInput: TInput,
  ctx: AiCallContext,
  runtimeOverride?: AiRuntime,
): Promise<{ data: TOutput; meta: AiRunMeta }> {
  // Entrada inválida = error de programación: falla antes de gastar o registrar nada.
  const input = prompt.input.parse(rawInput);
  const runtime = await loadRuntime(runtimeOverride);
  const startedAt = Date.now();
  const totals: AiUsageTotals = { ...ZERO_USAGE };
  let costUsd = 0;
  let attempts = 0;
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
      attempts: Math.max(attempts, 1),
      errorCode,
      requestId,
    });

  const meta = (usageId: number | null): AiRunMeta => ({
    promptId: prompt.id,
    promptVersion: prompt.version,
    provider: runtime.provider,
    model,
    attempts: Math.max(attempts, 1),
    usage: { ...totals },
    costUsd,
    durationMs: Date.now() - startedAt,
    requestId,
    usageId,
  });

  try {
    const budget = await runtime.budget.check(ctx.orgId);
    if (budget.exceeded) throw new AiError("budget_exceeded");

    const call = await prepare(prompt, input, ctx, runtime);

    if (runtime.provider === "mock" || !runtime.transport) {
      attempts = 1;
      const data = prompt.output.parse(prompt.mock(call.input, call.promptContext));
      return { data, meta: meta(await record("ok")) };
    }

    const messages: TransportMessage[] = [{ role: "user", content: call.userMessage }];
    let lastIssues = "";

    while (attempts < MAX_ATTEMPTS) {
      attempts += 1;
      const response: TransportResponse = await runtime.transport.generateStructured({
        model: runtime.model,
        system: call.system,
        messages,
        maxTokens: prompt.maxOutputTokens,
        effort: prompt.effort,
        schema: prompt.output,
      });
      addUsage(totals, response.usage);
      costUsd += estimateCostUsd(response.model, response.usage);
      requestId = response.requestId;
      model = response.model;

      if (response.stopReason === "refusal") {
        throw new AiError("refused", { detail: `categoría: ${response.refusalCategory ?? "n/d"}` });
      }
      if (response.stopReason === "max_tokens") throw new AiError("truncated");

      const candidate = response.parsed ?? safeJsonParse(response.text);
      const validation = prompt.output.safeParse(candidate);
      if (validation.success) {
        return { data: validation.data, meta: meta(await record("ok")) };
      }

      lastIssues = describeIssues(validation.error.issues);
      messages.push(
        { role: "assistant", content: response.text || "{}" },
        {
          role: "user",
          content: `Tu respuesta anterior no cumple el formato requerido (${lastIssues}). Devuelve de nuevo la respuesta completa y corregida.`,
        },
      );
    }

    throw new AiError("invalid_output", { detail: lastIssues });
  } catch (error) {
    const aiError = isAiError(error) ? error : new AiError("provider_error", { cause: error });
    await record(statusFor(aiError.code), aiError.code);
    throw aiError;
  }
}

/**
 * Ejecuta un prompt de texto libre (sin esquema). El `output` del prompt debe
 * aceptar un string; se usa para textos largos que no necesitan estructura.
 */
export async function generateText<TInput>(
  prompt: PromptDefinition<TInput, string>,
  rawInput: TInput,
  ctx: AiCallContext,
  runtimeOverride?: AiRuntime,
): Promise<{ data: string; meta: AiRunMeta }> {
  const input = prompt.input.parse(rawInput);
  const runtime = await loadRuntime(runtimeOverride);
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

  try {
    const budget = await runtime.budget.check(ctx.orgId);
    if (budget.exceeded) throw new AiError("budget_exceeded");

    const call = await prepare(prompt, input, ctx, runtime);
    let text: string;

    if (runtime.provider === "mock" || !runtime.transport) {
      text = prompt.output.parse(prompt.mock(call.input, call.promptContext));
    } else {
      const response = await runtime.transport.generateText({
        model: runtime.model,
        system: call.system,
        messages: [{ role: "user", content: call.userMessage }],
        maxTokens: prompt.maxOutputTokens,
        effort: prompt.effort,
      });
      addUsage(totals, response.usage);
      costUsd += estimateCostUsd(response.model, response.usage);
      requestId = response.requestId;
      model = response.model;
      if (response.stopReason === "refusal") throw new AiError("refused");
      if (response.stopReason === "max_tokens") throw new AiError("truncated");
      text = prompt.output.parse(response.text);
    }

    const usageId = await record("ok");
    return {
      data: text,
      meta: {
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
      },
    };
  } catch (error) {
    const aiError = isAiError(error) ? error : new AiError("provider_error", { cause: error });
    await record(statusFor(aiError.code), aiError.code);
    throw aiError;
  }
}

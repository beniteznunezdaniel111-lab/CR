import { AiError, isAiError } from "../errors";
import { estimateEmbeddingCostUsd } from "../pricing";
import type { AiCallContext } from "../types";
import type { AiUsageStatus, BudgetGuard, UsageRecorder } from "../usage";
import type { EmbeddingInputType, EmbeddingProvider } from "./types";

export { EMBEDDING_DIMENSIONS, type EmbeddingInputType, type EmbeddingProvider } from "./types";
export { MOCK_EMBEDDING_MODEL, mockEmbedding, tokenize } from "./mock";

/** Dependencias de los embeddings (inyectables en tests). */
export type EmbeddingRuntime = {
  provider: EmbeddingProvider;
  usage: UsageRecorder;
  budget: BudgetGuard;
  /** Umbral de similitud configurado (FAQ_MIN_SIMILARITY) o el del proveedor. */
  minSimilarity: number;
};

async function loadRuntime(runtime?: EmbeddingRuntime): Promise<EmbeddingRuntime> {
  if (runtime) return runtime;
  const { getEmbeddingRuntime } = await import("./runtime");
  return getEmbeddingRuntime();
}

/** Proveedor y umbral activos (para guardar el modelo y para buscar). */
export async function getEmbeddingSettings(runtime?: EmbeddingRuntime) {
  const active = await loadRuntime(runtime);
  return {
    provider: active.provider.name,
    model: active.provider.model,
    minSimilarity: active.minSimilarity,
  };
}

/**
 * Calcula embeddings por lotes. Comprueba el tope de gasto de la empresa antes
 * de llamar al proveedor y registra el consumo en ai_usage (también si falla).
 */
export async function embedTexts(
  texts: string[],
  options: {
    inputType: EmbeddingInputType;
    ctx: AiCallContext;
    feature: string;
    runtime?: EmbeddingRuntime;
  },
): Promise<{ vectors: number[][]; model: string }> {
  const runtime = await loadRuntime(options.runtime);
  const { provider } = runtime;
  const startedAt = Date.now();
  let tokens = 0;
  let calls = 0;

  const record = (status: AiUsageStatus, errorCode: string | null = null) =>
    runtime.usage.record({
      orgId: options.ctx.orgId,
      userId: options.ctx.userId,
      feature: options.feature,
      promptId: `embeddings.${options.inputType}`,
      promptVersion: 1,
      provider: provider.name,
      model: provider.model,
      usage: {
        inputTokens: tokens,
        outputTokens: 0,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
      },
      costUsd: estimateEmbeddingCostUsd(provider.model, tokens),
      durationMs: Date.now() - startedAt,
      status,
      attempts: Math.max(calls, 1),
      errorCode,
      requestId: null,
    });

  try {
    if (texts.length === 0) return { vectors: [], model: provider.model };
    const budget = await runtime.budget.check(options.ctx.orgId);
    if (budget.exceeded) throw new AiError("budget_exceeded");

    const vectors: number[][] = [];
    for (let start = 0; start < texts.length; start += provider.maxBatchSize) {
      calls += 1;
      const batch = texts.slice(start, start + provider.maxBatchSize);
      const result = await provider.embed(batch, options.inputType);
      tokens += result.tokens;
      vectors.push(...result.vectors);
    }
    await record("ok");
    return { vectors, model: provider.model };
  } catch (error) {
    const aiError = isAiError(error) ? error : new AiError("provider_error", { cause: error });
    await record(aiError.code === "budget_exceeded" ? "budget_exceeded" : "error", aiError.code);
    throw aiError;
  }
}

/** Formato de texto que acepta pgvector (y PostgREST) para una columna vector. */
export function toPgVector(vector: readonly number[]): string {
  return `[${vector.join(",")}]`;
}

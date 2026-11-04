import type { AiUsageTotals } from "./types";

type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadMultiplier: number;
  cacheWriteMultiplier: number;
  /** Tarifa distinta cuando el prompt supera un umbral de tokens. */
  longContext?: { thresholdTokens: number; inputPerMTok: number; outputPerMTok: number };
};

/**
 * Precios en USD por millón de tokens, solo para ESTIMAR el coste por empresa.
 * Los precios oficiales de Anthropic mandan; revisarlos al cambiar de modelo.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-5-5": {
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
    longContext: { thresholdTokens: 100_000, inputPerMTok: 0.5, outputPerMTok: 2.5 },
  },
  "claude-sonnet-5-5": {
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadMultiplier: 0.1,
    cacheWriteMultiplier: 1.25,
  },
  "claude-opus-5-5": {
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadMultiplier: 0.05,
    cacheWriteMultiplier: 1.25,
  },
};

/** Coste estimado de UNA respuesta (la tarifa depende del tamaño de su prompt). */
export function estimateCostUsd(model: string, usage: AiUsageTotals): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const promptTokens =
    usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  const long = pricing.longContext && promptTokens > pricing.longContext.thresholdTokens;
  const inputRate = long ? pricing.longContext!.inputPerMTok : pricing.inputPerMTok;
  const outputRate = long ? pricing.longContext!.outputPerMTok : pricing.outputPerMTok;

  const cost =
    usage.inputTokens * inputRate +
    usage.cacheReadInputTokens * inputRate * pricing.cacheReadMultiplier +
    usage.cacheCreationInputTokens * inputRate * pricing.cacheWriteMultiplier +
    usage.outputTokens * outputRate;

  return Math.round(cost) / 1_000_000;
}

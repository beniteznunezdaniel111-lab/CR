/**
 * Capa de IA: ÚNICA puerta de entrada a los modelos (ver CLAUDE.md).
 * Los módulos importan desde "@/lib/ai", nunca desde el SDK del proveedor.
 */
export { AiError, isAiError, type AiErrorCode } from "./errors";
export { generateObject, generateText } from "./generate";
export { streamCitedAnswer, type CitedPromptInput, type CitedPromptOutput } from "./cited";
export {
  embedTexts,
  getEmbeddingSettings,
  toPgVector,
  EMBEDDING_DIMENSIONS,
  type EmbeddingRuntime,
} from "./embeddings";
export type {
  CitationLocation,
  CitedStreamEvent,
  CitedTextBlock,
  SearchResultSource,
} from "./transport/types";
export { getLatestPrompt, getPromptVersion, listPrompts } from "./prompts/registry";
export { asData, baseSystemPrompt } from "./prompts/shared";
export { estimateCostUsd, MODEL_PRICING } from "./pricing";
export {
  definePrompt,
  type AiCallContext,
  type AiEffort,
  type AiRunMeta,
  type PromptContext,
  type PromptDefinition,
} from "./types";
export { computeBudgetStatus, type BudgetStatus } from "./usage";

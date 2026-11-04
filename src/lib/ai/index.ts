/**
 * Capa de IA: ÚNICA puerta de entrada a los modelos (ver CLAUDE.md).
 * Los módulos importan desde "@/lib/ai", nunca desde el SDK del proveedor.
 */
export { AiError, isAiError, type AiErrorCode } from "./errors";
export { generateObject, generateText } from "./generate";
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

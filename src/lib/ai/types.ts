import type { z } from "zod";
import type { CountryConfig } from "@/lib/countries";

export type AiProvider = "anthropic" | "mock";
export type AiEffort = "low" | "medium" | "high";

/** Contexto que reciben las plantillas de un prompt. */
export type PromptContext = {
  country: CountryConfig;
  organizationName: string;
};

/**
 * Definición versionada de un prompt. Una versión publicada no se edita nunca:
 * los cambios van en un fichero nuevo (`v2`) y la auditoría guarda id@versión.
 */
export type PromptDefinition<TInput, TOutput> = {
  /** Identificador estable, p. ej. "job.generate". */
  id: string;
  version: number;
  /** Módulo al que se imputa el consumo (ai_usage.feature). */
  feature: string;
  description: string;
  effort: AiEffort;
  maxOutputTokens: number;
  /** Límite de entrada propio; por defecto, el global de la capa de IA. */
  maxInputTokens?: number;
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  system: (ctx: PromptContext) => string;
  user: (input: TInput, ctx: PromptContext) => string;
  /** Respuesta determinista para tests, CI y demos sin coste. */
  mock: (input: TInput, ctx: PromptContext) => TOutput;
};

export function definePrompt<TInput, TOutput>(
  definition: PromptDefinition<TInput, TOutput>,
): Readonly<PromptDefinition<TInput, TOutput>> {
  return Object.freeze(definition);
}

/** Quién pide la llamada: se usa para el tope de gasto y el registro de uso. */
export type AiCallContext = {
  orgId: string;
  userId: string | null;
  organizationName: string;
  country: CountryConfig;
};

export type AiUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
};

export const ZERO_USAGE: Readonly<AiUsageTotals> = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationInputTokens: 0,
  cacheReadInputTokens: 0,
});

/** Metadatos de una ejecución: lo que se guarda en auditoría. */
export type AiRunMeta = {
  promptId: string;
  promptVersion: number;
  provider: AiProvider;
  model: string;
  attempts: number;
  usage: AiUsageTotals;
  costUsd: number;
  durationMs: number;
  requestId: string | null;
  usageId: number | null;
};

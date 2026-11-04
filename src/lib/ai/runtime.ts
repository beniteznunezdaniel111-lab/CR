import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { getServerEnv } from "@/lib/config/env";
import { AiError } from "./errors";
import { createSupabaseBudgetGuard, createSupabaseUsageRecorder } from "./supabase-sinks";
import { DEFAULT_MAX_INPUT_TOKENS } from "./tokens";
import { createAnthropicTransport } from "./transport/anthropic";
import type { AiTransport } from "./transport/types";
import type { AiProvider } from "./types";
import type { BudgetGuard, UsageRecorder } from "./usage";

/** Dependencias de la capa de IA (inyectables en tests). */
export type AiRuntime = {
  provider: AiProvider;
  model: string;
  transport: AiTransport | null;
  usage: UsageRecorder;
  budget: BudgetGuard;
  maxInputTokens: number;
};

let defaultRuntime: AiRuntime | undefined;
const forcedRuntime = new AsyncLocalStorage<AiRuntime>();

/**
 * Ejecuta `fn` con un runtime concreto en lugar del configurado. Lo usa la
 * empresa demo para generar sus contenidos con las respuestas mock (sin coste)
 * a través de los mismos procesos que la app.
 */
export function runWithAiRuntime<T>(runtime: AiRuntime, fn: () => Promise<T>): Promise<T> {
  return forcedRuntime.run(runtime, fn);
}

/** Runtime de respuestas mock: registra el uso (coste 0) y respeta el tope. */
export function createMockRuntime(): AiRuntime {
  return {
    provider: "mock",
    model: "mock",
    transport: null,
    usage: createSupabaseUsageRecorder(),
    budget: createSupabaseBudgetGuard(),
    maxInputTokens: DEFAULT_MAX_INPUT_TOKENS,
  };
}

export function getDefaultRuntime(): AiRuntime {
  const forced = forcedRuntime.getStore();
  if (forced) return forced;
  if (defaultRuntime) return defaultRuntime;
  const env = getServerEnv();

  let transport: AiTransport | null = null;
  if (env.AI_PROVIDER === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new AiError("not_configured", { detail: "Falta ANTHROPIC_API_KEY" });
    }
    transport = createAnthropicTransport(env.ANTHROPIC_API_KEY);
  }

  defaultRuntime = {
    provider: env.AI_PROVIDER,
    model: env.AI_PROVIDER === "mock" ? "mock" : env.ANTHROPIC_MODEL,
    transport,
    usage: createSupabaseUsageRecorder(),
    budget: createSupabaseBudgetGuard(),
    maxInputTokens: DEFAULT_MAX_INPUT_TOKENS,
  };
  return defaultRuntime;
}

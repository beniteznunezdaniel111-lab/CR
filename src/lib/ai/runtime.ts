import "server-only";
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

export function getDefaultRuntime(): AiRuntime {
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

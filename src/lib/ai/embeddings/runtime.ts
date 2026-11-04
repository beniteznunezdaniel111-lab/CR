import "server-only";
import { getServerEnv } from "@/lib/config/env";
import { AiError } from "../errors";
import { createSupabaseBudgetGuard, createSupabaseUsageRecorder } from "../supabase-sinks";
import type { EmbeddingRuntime } from "./index";
import { createMockEmbeddingProvider } from "./mock";
import type { EmbeddingProvider } from "./types";
import { createVoyageProvider } from "./voyage";

let cached: EmbeddingRuntime | undefined;

/**
 * Proveedor según el entorno: EMBEDDINGS_PROVIDER manda; sin él, Voyage si hay
 * VOYAGE_API_KEY y el mock (búsqueda casi solo por términos) si no.
 */
export function getEmbeddingRuntime(): EmbeddingRuntime {
  if (cached) return cached;
  const env = getServerEnv();
  const name = env.EMBEDDINGS_PROVIDER ?? (env.VOYAGE_API_KEY ? "voyage" : "mock");

  let provider: EmbeddingProvider;
  if (name === "voyage") {
    if (!env.VOYAGE_API_KEY) {
      throw new AiError("not_configured", { detail: "Falta VOYAGE_API_KEY" });
    }
    provider = createVoyageProvider(env.VOYAGE_API_KEY, env.VOYAGE_MODEL);
  } else {
    provider = createMockEmbeddingProvider();
  }

  cached = {
    provider,
    usage: createSupabaseUsageRecorder(),
    budget: createSupabaseBudgetGuard(),
    minSimilarity: env.FAQ_MIN_SIMILARITY ?? provider.defaultMinSimilarity,
  };
  return cached;
}

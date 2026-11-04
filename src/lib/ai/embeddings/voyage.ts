import { z } from "zod";
import { AiError } from "../errors";
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "./types";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
/** Modelos que admiten elegir la dimensión de salida (se pide 1024). */
const FLEXIBLE_DIMENSION_MODELS = new Set([
  "voyage-3.5",
  "voyage-3.5-lite",
  "voyage-3-large",
  "voyage-code-3",
  "voyage-context-3",
]);

const responseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()), index: z.number().int() })),
  usage: z.object({ total_tokens: z.number().int().nonnegative() }).optional(),
});

type FetchLike = typeof fetch;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorFor(status: number, detail: string): AiError {
  if (status === 401 || status === 403) return new AiError("not_configured", { detail });
  if (status === 429) return new AiError("rate_limited", { detail });
  if (status >= 500) return new AiError("provider_unavailable", { detail });
  return new AiError("provider_error", { detail });
}

/**
 * Embeddings de Voyage AI por HTTP. Reintenta dos veces (1 s y 3 s) ante 429,
 * errores 5xx o de red. Requiere permitir api.voyageai.com en la red del entorno.
 */
export function createVoyageProvider(
  apiKey: string,
  model: string,
  options: { fetch?: FetchLike; timeoutMs?: number; retryDelaysMs?: number[] } = {},
): EmbeddingProvider {
  const doFetch = options.fetch ?? fetch;
  const delays = options.retryDelaysMs ?? [1_000, 3_000];

  return {
    name: "voyage",
    model,
    // Punto de partida razonable para Voyage; se ajusta con FAQ_MIN_SIMILARITY.
    defaultMinSimilarity: 0.4,
    maxBatchSize: 64,
    async embed(texts, inputType) {
      const body = JSON.stringify({
        input: texts,
        model,
        input_type: inputType,
        truncation: true,
        ...(FLEXIBLE_DIMENSION_MODELS.has(model) ? { output_dimension: EMBEDDING_DIMENSIONS } : {}),
      });

      let lastError: AiError = new AiError("provider_unavailable");
      for (let attempt = 0; attempt <= delays.length; attempt += 1) {
        if (attempt > 0) await wait(delays[attempt - 1]!);
        let response: Response;
        try {
          response = await doFetch(VOYAGE_URL, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
            body,
            signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
          });
        } catch (error) {
          lastError = new AiError("provider_unavailable", { cause: error });
          continue;
        }

        if (!response.ok) {
          const detail = `Voyage ${response.status}: ${(await response.text()).slice(0, 300)}`;
          lastError = errorFor(response.status, detail);
          if (response.status === 429 || response.status >= 500) continue;
          throw lastError;
        }

        const parsed = responseSchema.safeParse(await response.json());
        if (!parsed.success) throw new AiError("invalid_output", { detail: "respuesta de Voyage" });
        const vectors = [...parsed.data.data]
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding);
        if (
          vectors.length !== texts.length ||
          vectors.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)
        ) {
          throw new AiError("invalid_output", {
            detail: `Voyage devolvió ${vectors.length} vectores de ${vectors[0]?.length ?? 0} dimensiones`,
          });
        }
        return { vectors, tokens: parsed.data.usage?.total_tokens ?? 0 };
      }
      throw lastError;
    },
  };
}

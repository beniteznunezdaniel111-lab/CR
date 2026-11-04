import { describe, expect, it } from "vitest";
import { AiError } from "@/lib/ai/errors";
import { type EmbeddingRuntime, embedTexts, toPgVector } from "@/lib/ai/embeddings";
import {
  MOCK_EMBEDDING_MODEL,
  createMockEmbeddingProvider,
  mockEmbedding,
} from "@/lib/ai/embeddings/mock";
import type { EmbeddingProvider } from "@/lib/ai/embeddings/types";
import { createVoyageProvider } from "@/lib/ai/embeddings/voyage";
import { estimateEmbeddingCostUsd } from "@/lib/ai/pricing";
import { CTX, MemoryRecorder, budget } from "./fakes";

const cosine = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i]!, 0);

describe("mockEmbedding", () => {
  it("es determinista, de 1024 dimensiones y normalizado", () => {
    const a = mockEmbedding("¿Cuántos días de vacaciones tengo?");
    expect(a).toHaveLength(1024);
    expect(mockEmbedding("¿Cuántos días de vacaciones tengo?")).toEqual(a);
    expect(cosine(a, a)).toBeCloseTo(1, 4);
  });

  it("acerca textos que comparten términos (sin tildes ni plurales)", () => {
    const question = mockEmbedding("¿Cuántos días de vacaciones tengo?");
    const similar = mockEmbedding("Días de vacación que me corresponden");
    const unrelated = mockEmbedding("Horario del comedor de la oficina");
    expect(cosine(question, similar)).toBeGreaterThan(0.6);
    expect(cosine(question, unrelated)).toBeLessThan(0.2);
  });

  it("nunca devuelve el vector cero (pgvector no admite similitud con él)", () => {
    const empty = mockEmbedding("¿?");
    expect(Math.hypot(...empty)).toBeCloseTo(1, 6);
  });
});

function runtime(provider: EmbeddingProvider, limitUsd = 20, spentUsd = 0) {
  const usage = new MemoryRecorder();
  const rt: EmbeddingRuntime = {
    provider,
    usage,
    budget: budget(limitUsd, spentUsd),
    minSimilarity: 0.5,
  };
  return { rt, usage };
}

describe("embedTexts", () => {
  it("trocea en lotes, devuelve los vectores en orden y registra el consumo", async () => {
    const calls: number[] = [];
    const provider: EmbeddingProvider = {
      ...createMockEmbeddingProvider(),
      maxBatchSize: 2,
      async embed(texts) {
        calls.push(texts.length);
        return { vectors: texts.map((text) => mockEmbedding(text)), tokens: 10 * texts.length };
      },
    };
    const { rt, usage } = runtime(provider);
    const texts = ["uno", "dos", "tres", "cuatro", "cinco"];
    const result = await embedTexts(texts, {
      inputType: "document",
      ctx: CTX,
      feature: "faq",
      runtime: rt,
    });
    expect(calls).toEqual([2, 2, 1]);
    expect(result.vectors).toEqual(texts.map((text) => mockEmbedding(text)));
    expect(result.model).toBe(MOCK_EMBEDDING_MODEL);
    expect(usage.entries).toEqual([
      expect.objectContaining({
        feature: "faq",
        promptId: "embeddings.document",
        provider: "mock",
        status: "ok",
        attempts: 3,
        usage: expect.objectContaining({ inputTokens: 50 }),
      }),
    ]);
  });

  it("no llama al proveedor si la empresa superó el tope (y lo registra)", async () => {
    let called = false;
    const provider: EmbeddingProvider = {
      ...createMockEmbeddingProvider(),
      async embed() {
        called = true;
        return { vectors: [], tokens: 0 };
      },
    };
    const { rt, usage } = runtime(provider, 20, 20);
    await expect(
      embedTexts(["hola"], { inputType: "query", ctx: CTX, feature: "faq", runtime: rt }),
    ).rejects.toMatchObject({ code: "budget_exceeded" });
    expect(called).toBe(false);
    expect(usage.entries[0]).toMatchObject({ status: "budget_exceeded" });
  });

  it("registra el error del proveedor y lo propaga como AiError", async () => {
    const provider: EmbeddingProvider = {
      ...createMockEmbeddingProvider(),
      async embed() {
        throw new AiError("provider_unavailable");
      },
    };
    const { rt, usage } = runtime(provider);
    await expect(
      embedTexts(["hola"], { inputType: "query", ctx: CTX, feature: "faq", runtime: rt }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(usage.entries[0]).toMatchObject({ status: "error", errorCode: "provider_unavailable" });
  });

  it("toPgVector produce el formato de texto de pgvector", () => {
    expect(toPgVector([0.5, -1, 0])).toBe("[0.5,-1,0]");
  });
});

describe("Voyage AI", () => {
  const vector = (seed: number) => Array.from({ length: 1024 }, (_, i) => (i === seed ? 1 : 0));

  it("envía modelo, tipo de entrada y dimensión, y ordena los vectores por índice", async () => {
    const requests: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
    const fakeFetch: typeof fetch = async (url, init) => {
      requests.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        auth: new Headers(init?.headers).get("authorization"),
      });
      return Response.json({
        data: [
          { embedding: vector(2), index: 1 },
          { embedding: vector(1), index: 0 },
        ],
        usage: { total_tokens: 42 },
      });
    };
    const provider = createVoyageProvider("clave-test", "voyage-3.5", { fetch: fakeFetch });
    const result = await provider.embed(["a", "b"], "query");
    expect(result).toEqual({ vectors: [vector(1), vector(2)], tokens: 42 });
    expect(requests[0]).toEqual({
      url: "https://api.voyageai.com/v1/embeddings",
      auth: "Bearer clave-test",
      body: {
        input: ["a", "b"],
        model: "voyage-3.5",
        input_type: "query",
        truncation: true,
        output_dimension: 1024,
      },
    });
  });

  it("reintenta ante 429 y 5xx, y no ante 401", async () => {
    let calls = 0;
    const flaky: typeof fetch = async () => {
      calls += 1;
      if (calls === 1) return new Response("demasiadas", { status: 429 });
      if (calls === 2) return new Response("caído", { status: 503 });
      return Response.json({
        data: [{ embedding: vector(0), index: 0 }],
        usage: { total_tokens: 1 },
      });
    };
    const provider = createVoyageProvider("k", "voyage-3.5", {
      fetch: flaky,
      retryDelaysMs: [0, 0],
    });
    await expect(provider.embed(["a"], "document")).resolves.toMatchObject({ tokens: 1 });
    expect(calls).toBe(3);

    let unauthorizedCalls = 0;
    const unauthorized: typeof fetch = async () => {
      unauthorizedCalls += 1;
      return new Response("no", { status: 401 });
    };
    const denied = createVoyageProvider("k", "voyage-3.5", {
      fetch: unauthorized,
      retryDelaysMs: [0, 0],
    });
    await expect(denied.embed(["a"], "document")).rejects.toMatchObject({ code: "not_configured" });
    expect(unauthorizedCalls).toBe(1);
  });

  it("rechaza vectores de otra dimensión", async () => {
    const wrong: typeof fetch = async () =>
      Response.json({ data: [{ embedding: [1, 2, 3], index: 0 }], usage: { total_tokens: 1 } });
    const provider = createVoyageProvider("k", "voyage-3.5", { fetch: wrong });
    await expect(provider.embed(["a"], "document")).rejects.toMatchObject({
      code: "invalid_output",
    });
  });

  it("estima el coste con el precio por millón de tokens", () => {
    expect(estimateEmbeddingCostUsd("voyage-3.5", 1_000_000)).toBeCloseTo(0.06, 9);
    expect(estimateEmbeddingCostUsd(MOCK_EMBEDDING_MODEL, 1_000_000)).toBe(0);
  });
});

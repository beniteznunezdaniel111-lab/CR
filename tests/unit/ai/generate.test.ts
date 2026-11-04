import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AiError } from "@/lib/ai/errors";
import { generateObject, generateText } from "@/lib/ai/generate";
import { definePrompt } from "@/lib/ai/types";
import { getCountry } from "@/lib/countries";
import { CTX, FakeTransport, budget, response, runtime } from "./fakes";

const prompt = definePrompt({
  id: "test.summary",
  version: 3,
  feature: "test",
  description: "Prompt de prueba",
  effort: "low",
  maxOutputTokens: 1000,
  input: z.object({ text: z.string().min(1) }),
  output: z.object({ summary: z.string().min(5), tags: z.array(z.string()).max(3) }),
  system: (ctx) => `Sistema para ${ctx.organizationName} (${ctx.country.code})`,
  user: (input) => `Resume: ${input.text}`,
  mock: (input) => ({ summary: `Resumen de ${input.text}`, tags: ["mock"] }),
});

const VALID = { summary: "Un resumen correcto", tags: ["a"] };

describe("generateObject", () => {
  it("con el proveedor mock devuelve la respuesta determinista y registra el uso sin coste", async () => {
    const rt = runtime({ provider: "mock", model: "mock", transport: null });
    const result = await generateObject(prompt, { text: "hola" }, CTX, rt);
    expect(result.data).toEqual({ summary: "Resumen de hola", tags: ["mock"] });
    expect(result.meta).toMatchObject({
      promptId: "test.summary",
      promptVersion: 3,
      provider: "mock",
    });
    expect(rt.usage.entries).toEqual([
      expect.objectContaining({
        status: "ok",
        model: "mock",
        costUsd: 0,
        feature: "test",
        promptVersion: 3,
      }),
    ]);
  });

  it("pasa el contexto del país y de la empresa al prompt", async () => {
    const transport = new FakeTransport([response({ parsed: VALID })]);
    const rt = runtime({ transport });
    await generateObject(prompt, { text: "x" }, { ...CTX, country: getCountry("CR") }, rt);
    expect(transport.structuredRequests[0]?.system).toBe("Sistema para Empresa Demo (CR)");
    expect(transport.structuredRequests[0]).toMatchObject({
      model: "claude-haiku-5-5",
      effort: "low",
      maxTokens: 1000,
    });
  });

  it("valida la salida y registra tokens, coste estimado e id de petición", async () => {
    const rt = runtime({ transport: new FakeTransport([response({ parsed: VALID })]) });
    const result = await generateObject(prompt, { text: "x" }, CTX, rt);
    expect(result.data).toEqual(VALID);
    // Haiku 5.5: 1000 × 0,10 $/M + 500 × 0,50 $/M = 0,00035 $
    expect(result.meta.costUsd).toBeCloseTo(0.00035, 8);
    expect(rt.usage.entries[0]).toMatchObject({
      status: "ok",
      attempts: 1,
      requestId: "req_test",
      usage: { inputTokens: 1000, outputTokens: 500 },
      orgId: CTX.orgId,
      userId: CTX.userId,
    });
  });

  it("si la salida no valida, reintenta una vez con el error como feedback", async () => {
    const transport = new FakeTransport([
      response({ parsed: { summary: "no", tags: [] }, text: '{"summary":"no","tags":[]}' }),
      response({ parsed: VALID }),
    ]);
    const rt = runtime({ transport });
    const result = await generateObject(prompt, { text: "x" }, CTX, rt);
    expect(result.data).toEqual(VALID);
    expect(result.meta.attempts).toBe(2);
    const retry = transport.structuredRequests[1]!.messages;
    expect(retry).toHaveLength(3);
    expect(retry[1]).toEqual({ role: "assistant", content: '{"summary":"no","tags":[]}' });
    expect(retry[2]?.content).toMatch(/no cumple el formato.*summary/);
    expect(rt.usage.entries[0]).toMatchObject({
      status: "ok",
      attempts: 2,
      usage: { inputTokens: 2000 },
    });
  });

  it("tras dos salidas inválidas falla con invalid_output y lo registra", async () => {
    const bad = response({ parsed: { summary: "", tags: [] } });
    const rt = runtime({ transport: new FakeTransport([bad, { ...bad }]) });
    await expect(generateObject(prompt, { text: "x" }, CTX, rt)).rejects.toMatchObject({
      code: "invalid_output",
    });
    expect(rt.usage.entries[0]).toMatchObject({ status: "validation_failed", attempts: 2 });
  });

  it("si el texto no viene parseado, intenta leer el JSON del texto", async () => {
    const rt = runtime({
      transport: new FakeTransport([response({ parsed: null, text: JSON.stringify(VALID) })]),
    });
    expect((await generateObject(prompt, { text: "x" }, CTX, rt)).data).toEqual(VALID);
  });

  it("un rechazo del modelo se convierte en error controlado y se registra", async () => {
    const rt = runtime({
      transport: new FakeTransport([response({ stopReason: "refusal", refusalCategory: "cyber" })]),
    });
    const error = await generateObject(prompt, { text: "x" }, CTX, rt).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect((error as AiError).code).toBe("refused");
    expect((error as AiError).userMessage).toMatch(/no ha podido generar/);
    expect(rt.usage.entries[0]).toMatchObject({ status: "refused", errorCode: "refused" });
  });

  it("una respuesta cortada por max_tokens es un error", async () => {
    const rt = runtime({ transport: new FakeTransport([response({ stopReason: "max_tokens" })]) });
    await expect(generateObject(prompt, { text: "x" }, CTX, rt)).rejects.toMatchObject({
      code: "truncated",
    });
  });

  it("no llama a la IA si la empresa ha superado su tope mensual", async () => {
    const transport = new FakeTransport([response({ parsed: VALID })]);
    const rt = runtime({ transport, budget: budget(20, 20) });
    await expect(generateObject(prompt, { text: "x" }, CTX, rt)).rejects.toMatchObject({
      code: "budget_exceeded",
    });
    expect(transport.structuredRequests).toHaveLength(0);
    expect(rt.usage.entries[0]).toMatchObject({ status: "budget_exceeded", costUsd: 0 });
  });

  it("rechaza entradas que superan el límite de tokens (conteo exacto si se acerca)", async () => {
    const transport = new FakeTransport([response({ parsed: VALID })], 95_000);
    const rt = runtime({ transport, maxInputTokens: 1_000 });
    await expect(
      generateObject(prompt, { text: "a".repeat(2_000) }, CTX, rt),
    ).rejects.toMatchObject({ code: "input_too_large" });
    expect(transport.countRequests).toHaveLength(1);
    expect(transport.structuredRequests).toHaveLength(0);
  });

  it("no gasta una llamada de conteo con entradas pequeñas", async () => {
    const transport = new FakeTransport([response({ parsed: VALID })]);
    await generateObject(prompt, { text: "corto" }, CTX, runtime({ transport }));
    expect(transport.countRequests).toHaveLength(0);
  });

  it("los errores del proveedor se propagan como AiError y quedan registrados", async () => {
    const rt = runtime({ transport: new FakeTransport([new AiError("rate_limited")]) });
    await expect(generateObject(prompt, { text: "x" }, CTX, rt)).rejects.toMatchObject({
      code: "rate_limited",
    });
    expect(rt.usage.entries[0]).toMatchObject({ status: "error", errorCode: "rate_limited" });
  });

  it("una entrada inválida es un error de programación: no llama a la IA ni registra uso", async () => {
    const transport = new FakeTransport([]);
    const rt = runtime({ transport });
    await expect(generateObject(prompt, { text: "" }, CTX, rt)).rejects.toThrow();
    expect(transport.structuredRequests).toHaveLength(0);
    expect(rt.usage.entries).toHaveLength(0);
  });
});

describe("generateText", () => {
  const textPrompt = definePrompt({
    id: "test.text",
    version: 1,
    feature: "test",
    description: "Texto libre",
    effort: "low",
    maxOutputTokens: 500,
    input: z.object({ topic: z.string() }),
    output: z.string().min(1),
    system: () => "Sistema",
    user: (input) => input.topic,
    mock: (input) => `Texto sobre ${input.topic}`,
  });

  it("devuelve el texto y registra el uso", async () => {
    const rt = runtime({ transport: new FakeTransport([response({ text: "Hola mundo" })]) });
    const result = await generateText(textPrompt, { topic: "x" }, CTX, rt);
    expect(result.data).toBe("Hola mundo");
    expect(rt.usage.entries[0]).toMatchObject({ status: "ok", promptId: "test.text" });
  });

  it("en modo mock usa la respuesta determinista", async () => {
    const rt = runtime({ provider: "mock", model: "mock", transport: null });
    expect((await generateText(textPrompt, { topic: "vacaciones" }, CTX, rt)).data).toBe(
      "Texto sobre vacaciones",
    );
  });
});

describe("tope mensual", () => {
  it("avisa a partir del 80 % y bloquea al llegar al 100 %", async () => {
    const { computeBudgetStatus } = await import("@/lib/ai/usage");
    expect(computeBudgetStatus(20, 15)).toMatchObject({ warning: false, exceeded: false });
    expect(computeBudgetStatus(20, 16)).toMatchObject({ warning: true, exceeded: false });
    expect(computeBudgetStatus(20, 20)).toMatchObject({ exceeded: true });
    expect(computeBudgetStatus(0, 0)).toMatchObject({ exceeded: true });
  });
});

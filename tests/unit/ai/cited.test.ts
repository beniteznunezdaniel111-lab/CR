import { describe, expect, it } from "vitest";
import { streamCitedAnswer } from "@/lib/ai/cited";
import { faqAnswerV1 } from "@/lib/ai/prompts/faq/answer.v1";
import type { CitedStreamEvent } from "@/lib/ai/transport/types";
import { CTX, FakeTransport, budget, citedResponse, runtime } from "./fakes";

const input = {
  question: "¿Cuántos días de vacaciones tengo?",
  history: [
    { role: "user" as const, content: "¿Puedo teletrabajar?" },
    { role: "assistant" as const, content: "Dos días por semana." },
  ],
  results: [
    {
      source: "chunk-1",
      title: "Política de vacaciones (pág. 2)",
      blocks: ["Son 23 días laborables al año.", "Se piden con 15 días de antelación."],
    },
  ],
};

const citation = {
  searchResultIndex: 0,
  startBlockIndex: 0,
  endBlockIndex: 1,
  citedText: "Son 23 días laborables al año.",
  source: "chunk-1",
};

describe("streamCitedAnswer", () => {
  it("reenvía texto y citas, y registra el consumo", async () => {
    const events: CitedStreamEvent[] = [
      { type: "text", block: 0, text: "Tienes " },
      { type: "citation", block: 1, citation },
      { type: "text", block: 1, text: "23 días laborables." },
    ];
    const transport = new FakeTransport([], 100, [
      {
        events,
        response: citedResponse({
          blocks: [
            { text: "Tienes ", citations: [] },
            { text: "23 días laborables.", citations: [citation] },
          ],
        }),
      },
    ]);
    const rt = runtime({ transport });
    const received: CitedStreamEvent[] = [];
    const result = await streamCitedAnswer(faqAnswerV1, input, CTX, (e) => received.push(e), {
      runtime: rt,
    });

    expect(received).toEqual(events);
    expect(result.blocks[1]!.citations).toEqual([citation]);
    expect(rt.usage.entries).toEqual([
      expect.objectContaining({ feature: "faq", promptId: "faq.answer", status: "ok" }),
    ]);

    const [request] = transport.citedRequests;
    expect(request!.searchResults).toEqual(input.results);
    // Las preguntas anteriores son datos de la persona: van delimitadas.
    expect(request!.history[0]!.content).toMatch(/^<datos nombre="pregunta">/);
    expect(request!.history[1]).toEqual({ role: "assistant", content: "Dos días por semana." });
    expect(request!.question).toMatch(/Cuántos días de vacaciones/);
    expect(request!.system).toMatch(/EXCLUSIVAMENTE los resultados de búsqueda/);
  });

  it("no llama a la IA si la empresa superó el tope", async () => {
    const transport = new FakeTransport([], 100, []);
    const rt = runtime({ transport, budget: budget(20, 25) });
    await expect(
      streamCitedAnswer(faqAnswerV1, input, CTX, () => undefined, { runtime: rt }),
    ).rejects.toMatchObject({ code: "budget_exceeded" });
    expect(transport.citedRequests).toHaveLength(0);
    expect(rt.usage.entries[0]).toMatchObject({ status: "budget_exceeded" });
  });

  it("un rechazo del modelo se convierte en AiError(refused)", async () => {
    const transport = new FakeTransport([], 100, [
      { events: [], response: citedResponse({ stopReason: "refusal" }) },
    ]);
    const rt = runtime({ transport });
    await expect(
      streamCitedAnswer(faqAnswerV1, input, CTX, () => undefined, { runtime: rt }),
    ).rejects.toMatchObject({ code: "refused" });
    expect(rt.usage.entries[0]).toMatchObject({ status: "refused" });
  });

  it("en modo mock cita el párrafo que responde a la pregunta, en streaming", async () => {
    const rt = runtime({ provider: "mock", model: "mock", transport: null });
    const received: CitedStreamEvent[] = [];
    const result = await streamCitedAnswer(faqAnswerV1, input, CTX, (e) => received.push(e), {
      runtime: rt,
    });
    expect(result.blocks[1]).toEqual({
      text: "Son 23 días laborables al año.",
      citations: [citation],
    });
    expect(received.filter((e) => e.type === "text").length).toBeGreaterThan(2);
    expect(received).toContainEqual({ type: "citation", block: 1, citation });
  });

  it("en modo mock, sin términos en común, responde sin citas", async () => {
    const rt = runtime({ provider: "mock", model: "mock", transport: null });
    const result = await streamCitedAnswer(
      faqAnswerV1,
      { ...input, question: "¿Dónde aparco la bicicleta?" },
      CTX,
      () => undefined,
      { runtime: rt },
    );
    expect(result.blocks.every((block) => block.citations.length === 0)).toBe(true);
  });
});

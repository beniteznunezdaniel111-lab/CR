import { describe, expect, it } from "vitest";
import {
  AnswerAssembler,
  type RetrievedChunk,
  buildHistory,
  searchResultTitle,
} from "@/modules/faq/answer";

const chunks: RetrievedChunk[] = [
  {
    chunkId: "c1",
    documentId: "d1",
    documentTitle: "Política de vacaciones",
    heading: "Vacaciones",
    blocks: ["Son 23 días laborables al año.", "Se piden con 15 días de antelación."],
    pageFrom: 2,
    pageTo: 2,
  },
  {
    chunkId: "c2",
    documentId: "d2",
    documentTitle: "Manual",
    heading: null,
    blocks: ["El teletrabajo es de dos días."],
    pageFrom: null,
    pageTo: null,
  },
];

const cite = (searchResultIndex: number, start: number, end: number, source?: string) => ({
  searchResultIndex,
  startBlockIndex: start,
  endBlockIndex: end,
  citedText: "x",
  source: source ?? chunks[searchResultIndex]?.chunkId ?? "?",
});

describe("AnswerAssembler", () => {
  it("numera las fuentes, reutiliza el número de una cita repetida y conserva el texto", () => {
    const assembler = new AnswerAssembler(chunks);
    assembler.addText(0, "Tienes ");
    expect(assembler.addCitation(1, cite(0, 0, 1))).toMatchObject({ n: 1 });
    assembler.addText(1, "23 días laborables.");
    expect(assembler.addCitation(2, cite(1, 0, 1))).toMatchObject({ n: 2 });
    assembler.addText(2, " Y dos de teletrabajo.");
    expect(assembler.addCitation(3, cite(0, 0, 1))).toEqual({ n: 1, source: null });
    assembler.addText(3, " Repetido.");

    const result = assembler.result();
    expect(result.outcome).toBe("answered");
    expect(result.text).toBe("Tienes 23 días laborables. Y dos de teletrabajo. Repetido.");
    expect(result.segments.map((segment) => segment.refs)).toEqual([[], [1], [2], [1]]);
    expect(result.sources).toEqual([
      expect.objectContaining({
        n: 1,
        documentTitle: "Política de vacaciones",
        pageFrom: 2,
        citedText: "Son 23 días laborables al año.",
      }),
      expect.objectContaining({ n: 2, documentId: "d2", pageFrom: null }),
    ]);
  });

  it("descarta citas a resultados inexistentes, con otra fuente o con rangos inválidos", () => {
    const assembler = new AnswerAssembler(chunks);
    expect(assembler.addCitation(0, cite(5, 0, 1, "c9"))).toBeNull();
    expect(assembler.addCitation(0, cite(0, 0, 1, "c2"))).toBeNull();
    expect(assembler.addCitation(0, cite(0, 1, 1))).toBeNull();
    expect(assembler.addCitation(0, cite(0, 0, 3))).toBeNull();
    expect(assembler.addCitation(0, cite(0, -1, 1))).toBeNull();
  });

  it("una respuesta sin ninguna cita válida se trata como «no lo sé»", () => {
    const assembler = new AnswerAssembler(chunks);
    assembler.addText(0, "Creo que son 30 días, pero no estoy seguro.");
    assembler.addCitation(0, cite(7, 0, 1, "inventada"));
    expect(assembler.result()).toEqual({
      outcome: "not_found",
      text: "",
      segments: [],
      sources: [],
    });
  });

  it("el texto citado se toma de los fragmentos, no de la respuesta del modelo", () => {
    const assembler = new AnswerAssembler(chunks);
    assembler.addCitation(0, { ...cite(0, 0, 2), citedText: "texto manipulado" });
    assembler.addText(0, "Respuesta.");
    expect(assembler.result().sources[0]!.citedText).toBe(
      "Son 23 días laborables al año. Se piden con 15 días de antelación.",
    );
  });
});

describe("buildHistory", () => {
  it("usa solo pares completos pregunta-respuesta y los más recientes", () => {
    const messages = [
      { role: "user", content: "P1" },
      { role: "assistant", content: "R1" },
      { role: "user", content: "P2 sin respuesta" },
      { role: "user", content: "P3" },
      { role: "assistant", content: "R3" },
      { role: "user", content: "P4" },
      { role: "assistant", content: "R4" },
      { role: "user", content: "P5" },
      { role: "assistant", content: "R5" },
    ];
    expect(buildHistory(messages, 2)).toEqual([
      { role: "user", content: "P4" },
      { role: "assistant", content: "R4" },
      { role: "user", content: "P5" },
      { role: "assistant", content: "R5" },
    ]);
    expect(buildHistory(messages).map((message) => message.content)).toEqual([
      "P3",
      "R3",
      "P4",
      "R4",
      "P5",
      "R5",
    ]);
  });
});

describe("searchResultTitle", () => {
  it("incluye documento, sección y páginas", () => {
    expect(searchResultTitle(chunks[0]!)).toBe("Política de vacaciones · Vacaciones (pág. 2)");
    expect(searchResultTitle({ ...chunks[0]!, pageTo: 4 })).toBe(
      "Política de vacaciones · Vacaciones (págs. 2-4)",
    );
    expect(searchResultTitle(chunks[1]!)).toBe("Manual");
  });
});

import { describe, expect, it } from "vitest";
import {
  BLOCK_MAX_CHARS,
  CHUNK_TARGET_CHARS,
  chunkDocument,
  embeddingTextFor,
  isHeadingLine,
  splitLongParagraph,
  splitParagraphs,
} from "@/modules/faq/chunking";

describe("isHeadingLine", () => {
  it.each([
    "1. Vacaciones",
    "2.3 Permisos retribuidos",
    "CAPÍTULO II",
    "POLÍTICA DE TELETRABAJO",
    "Artículo 12 Jornada",
    "## Beneficios sociales",
  ])("reconoce «%s» como título", (line) => {
    expect(isHeadingLine(line)).toBe(true);
  });

  it.each([
    "Cada persona tiene derecho a 23 días laborables de vacaciones al año.",
    "1. Solicita las vacaciones en el portal.",
    "las vacaciones se solicitan",
    "IT",
  ])("no confunde «%s» con un título", (line) => {
    expect(isHeadingLine(line)).toBe(false);
  });
});

describe("splitParagraphs", () => {
  it("une las líneas cortadas de un PDF y separa al terminar la frase", () => {
    const text =
      "Cada persona tiene derecho a 23 días\nlaborables de vacaciones al año.\nSe solicitan con quince días de antelación.";
    expect(splitParagraphs(text)).toEqual([
      "Cada persona tiene derecho a 23 días laborables de vacaciones al año.",
      "Se solicitan con quince días de antelación.",
    ]);
  });

  it("separa títulos y elementos de lista, y repara palabras partidas con guion", () => {
    const text = "VACACIONES\n- Días labo-\nrables por año\n- Se acumulan hasta marzo";
    expect(splitParagraphs(text)).toEqual([
      "VACACIONES",
      "- Días laborables por año",
      "- Se acumulan hasta marzo",
    ]);
  });
});

describe("splitLongParagraph", () => {
  it("parte por frases sin superar el máximo", () => {
    const sentence = "Esta es una frase de ejemplo que se repite para alargar el párrafo. ";
    const pieces = splitLongParagraph(sentence.repeat(40).trim());
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(BLOCK_MAX_CHARS);
    expect(pieces.join(" ")).toBe(sentence.repeat(40).trim());
  });

  it("parte por palabras una frase sin puntos demasiado larga", () => {
    const pieces = splitLongParagraph("palabra ".repeat(400).trim());
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(BLOCK_MAX_CHARS);
  });
});

describe("chunkDocument", () => {
  const pages = [
    {
      page: 1,
      text: "POLÍTICA DE VACACIONES\n\n1. Vacaciones\nCada persona tiene derecho a 23 días laborables de vacaciones al año.\nSe solicitan con quince días de antelación.",
    },
    {
      page: 2,
      text: "2. Teletrabajo\nSe puede teletrabajar dos días por semana con acuerdo del responsable.",
    },
  ];

  it("crea un fragmento por sección con su título y su página", () => {
    const chunks = chunkDocument(pages);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      index: 0,
      heading: "POLÍTICA DE VACACIONES › 1. Vacaciones",
      pageFrom: 1,
      pageTo: 1,
      blocks: [
        "Cada persona tiene derecho a 23 días laborables de vacaciones al año.",
        "Se solicitan con quince días de antelación.",
      ],
    });
    expect(chunks[1]).toMatchObject({ index: 1, heading: "2. Teletrabajo", pageFrom: 2 });
    expect(chunks[0]!.content).toBe(chunks[0]!.blocks.join("\n\n"));
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
  });

  it("parte las secciones largas con un párrafo de solape y sin pasarse de tamaño", () => {
    const paragraph = (n: number) =>
      `Párrafo ${n}: las normas internas describen con detalle cómo se organiza el trabajo del equipo.`;
    const text = Array.from({ length: 80 }, (_, i) => paragraph(i + 1)).join("\n\n");
    const chunks = chunkDocument([{ page: 3, text: `NORMAS\n\n${text}` }]);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.heading).toBe("NORMAS");
      expect(chunk.content.length).toBeLessThanOrEqual(CHUNK_TARGET_CHARS + BLOCK_MAX_CHARS);
    }
    // El último párrafo de un fragmento abre el siguiente.
    expect(chunks[1]!.blocks[0]).toBe(chunks[0]!.blocks.at(-1));
  });

  it("los DOCX no tienen páginas", () => {
    const [chunk] = chunkDocument([{ page: null, text: "Texto de una política sin páginas." }]);
    expect(chunk).toMatchObject({ pageFrom: null, pageTo: null, heading: null });
  });

  it("un documento sin texto no genera fragmentos", () => {
    expect(chunkDocument([{ page: 1, text: "" }])).toEqual([]);
  });

  it("el texto del embedding incluye documento y sección", () => {
    const [chunk] = chunkDocument(pages);
    expect(embeddingTextFor("Manual", chunk!)).toMatch(/^Manual\nPOLÍTICA DE VACACIONES/);
  });
});

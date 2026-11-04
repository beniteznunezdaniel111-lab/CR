import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DOCX_MIME, PDF_MIME, extractDocumentPages } from "@/lib/extraction";
import { chunkDocument } from "@/modules/faq/chunking";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "faq", name)));

describe("ingesta de documentos de la FAQ", () => {
  it("un PDF conserva sus páginas y se trocea por secciones", async () => {
    const { pages, totalPages } = await extractDocumentPages(
      fixture("politica-vacaciones.pdf"),
      PDF_MIME,
    );
    expect(totalPages).toBe(2);
    expect(pages.map((page) => page.page)).toEqual([1, 2]);

    const chunks = chunkDocument(pages);
    expect(chunks.map((chunk) => [chunk.heading, chunk.pageFrom])).toEqual([
      ["POLÍTICA DE VACACIONES Y PERMISOS", 1],
      ["1. Vacaciones", 1],
      ["2. Teletrabajo", 2],
      ["3. Permisos retribuidos", 2],
    ]);
    expect(chunks[1]!.blocks[0]).toBe(
      "Cada persona tiene derecho a 23 días laborables de vacaciones al año.",
    );
  });

  it("un DOCX no tiene páginas", async () => {
    const { pages, totalPages } = await extractDocumentPages(
      fixture("manual-bienvenida.docx"),
      DOCX_MIME,
    );
    expect(totalPages).toBeNull();
    const chunks = chunkDocument(pages);
    expect(chunks.map((chunk) => chunk.heading)).toEqual([
      "MANUAL DE BIENVENIDA › Horario",
      "Material",
    ]);
    expect(chunks.every((chunk) => chunk.pageFrom === null)).toBe(true);
  });

  it("rechaza un PDF sin texto (escaneado)", async () => {
    const scanned = new Uint8Array(
      readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "cvs", "cv-escaneado.pdf")),
    );
    await expect(extractDocumentPages(scanned, PDF_MIME)).rejects.toMatchObject({
      code: "no_text",
    });
  });
});

/**
 * Ensamblado de la respuesta de la FAQ a partir del streaming con citas:
 * valida cada cita contra los fragmentos enviados, numera las fuentes y decide
 * el resultado. Una respuesta sin ninguna cita válida se trata como "no lo sé".
 */
import type { CitationLocation } from "@/lib/ai";
import type { Enums } from "@/lib/supabase/database.types";

export type FaqOutcome = Enums<"faq_outcome">;

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  heading: string | null;
  blocks: string[];
  pageFrom: number | null;
  pageTo: number | null;
};

/** Fuente citada, numerada en orden de aparición ([1], [2]...). */
export type FaqSource = {
  n: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  heading: string | null;
  pageFrom: number | null;
  pageTo: number | null;
  citedText: string;
};

/** Tramo de la respuesta con las fuentes que lo respaldan. */
export type FaqSegment = { text: string; refs: number[] };

export type FaqAnswer =
  | { outcome: "answered"; text: string; segments: FaqSegment[]; sources: FaqSource[] }
  | { outcome: "not_found"; text: ""; segments: []; sources: [] };

/** Contenido guardado (y enviado como historial) cuando no hay respuesta. */
export const NOT_FOUND_CONTENT = "No encontré la respuesta en la documentación de la empresa.";
export const ERROR_CONTENT = "No se pudo responder por un error técnico.";

/** Título del bloque search_result: documento, sección y páginas. */
export function searchResultTitle(chunk: RetrievedChunk): string {
  const pages =
    chunk.pageFrom === null
      ? ""
      : chunk.pageTo !== null && chunk.pageTo !== chunk.pageFrom
        ? ` (págs. ${chunk.pageFrom}-${chunk.pageTo})`
        : ` (pág. ${chunk.pageFrom})`;
  return `${chunk.documentTitle}${chunk.heading ? ` · ${chunk.heading}` : ""}${pages}`.slice(
    0,
    400,
  );
}

export class AnswerAssembler {
  private readonly segmentList: FaqSegment[] = [];
  private readonly sourceList: FaqSource[] = [];
  private readonly keys = new Map<string, number>();

  constructor(private readonly chunks: readonly RetrievedChunk[]) {}

  private segment(block: number): FaqSegment {
    while (this.segmentList.length <= block) this.segmentList.push({ text: "", refs: [] });
    return this.segmentList[block]!;
  }

  addText(block: number, text: string): void {
    this.segment(block).text += text;
  }

  /**
   * Registra una cita. Devuelve su número (y la fuente si es la primera vez que
   * se cita) o null si no corresponde a ningún fragmento enviado.
   */
  addCitation(
    block: number,
    citation: CitationLocation,
  ): { n: number; source: FaqSource | null } | null {
    const chunk = this.chunks[citation.searchResultIndex];
    if (!chunk || citation.source !== chunk.chunkId) return null;
    const { startBlockIndex: start, endBlockIndex: end } = citation;
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      end > chunk.blocks.length
    ) {
      return null;
    }

    const key = `${citation.searchResultIndex}:${start}:${end}`;
    let n = this.keys.get(key);
    let created: FaqSource | null = null;
    if (n === undefined) {
      n = this.sourceList.length + 1;
      this.keys.set(key, n);
      created = {
        n,
        chunkId: chunk.chunkId,
        documentId: chunk.documentId,
        documentTitle: chunk.documentTitle,
        heading: chunk.heading,
        pageFrom: chunk.pageFrom,
        pageTo: chunk.pageTo,
        // El texto citado se toma de nuestros fragmentos, no de la respuesta.
        citedText: chunk.blocks.slice(start, end).join(" "),
      };
      this.sourceList.push(created);
    }
    const segment = this.segment(block);
    if (!segment.refs.includes(n)) segment.refs.push(n);
    return { n, source: created };
  }

  result(): FaqAnswer {
    const segments = this.segmentList.filter(
      (segment) => segment.text.length > 0 || segment.refs.length > 0,
    );
    const text = segments
      .map((segment) => segment.text)
      .join("")
      .trim();
    if (this.sourceList.length === 0 || !text) {
      return { outcome: "not_found", text: "", segments: [], sources: [] };
    }
    return { outcome: "answered", text, segments, sources: [...this.sourceList] };
  }
}

type StoredMessage = { role: string; content: string };

/**
 * Historial para la IA: pares pregunta-respuesta completos, como texto plano y
 * solo los `maxPairs` más recientes.
 */
export function buildHistory(
  messages: readonly StoredMessage[],
  maxPairs = 3,
): { role: "user" | "assistant"; content: string }[] {
  const pairs: { role: "user" | "assistant"; content: string }[][] = [];
  for (let i = 0; i < messages.length - 1; i += 1) {
    const current = messages[i]!;
    const next = messages[i + 1]!;
    if (current.role === "user" && next.role === "assistant") {
      pairs.push([
        { role: "user", content: current.content.slice(0, 4000) },
        { role: "assistant", content: next.content.slice(0, 4000) },
      ]);
      i += 1;
    }
  }
  return pairs.slice(-maxPairs).flat();
}

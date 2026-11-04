/**
 * Troceo de documentos para la FAQ: secciones por títulos, fragmentos de unas
 * 700 tokens con un párrafo de solape y el número de página de cada fragmento.
 * Cada párrafo es un "bloque" citable por la IA (las citas apuntan a bloques).
 */
import type { PageText } from "@/lib/extraction";

/** ~700 tokens (≈3 caracteres por token en español). */
export const CHUNK_TARGET_CHARS = 2_000;
/** Un párrafo más largo se parte por frases para que las citas sean precisas. */
export const BLOCK_MAX_CHARS = 900;
export const MAX_BLOCKS_PER_CHUNK = 40;
/** Solape: el último párrafo de un fragmento se repite al empezar el siguiente. */
const OVERLAP_MAX_CHARS = 400;
const HEADING_MAX_CHARS = 300;

export type DocumentChunk = {
  index: number;
  heading: string | null;
  blocks: string[];
  content: string;
  pageFrom: number | null;
  pageTo: number | null;
  tokenCount: number;
};

type Paragraph = { text: string; page: number | null; heading: boolean };
type Block = { text: string; page: number | null };

const LIST_ITEM = /^([-•*·–]|\d{1,3}[.)]|[a-z][.)])\s+/;
const NUMBERED_HEADING = /^(\d{1,2}(\.\d{1,2})*\.?|[IVXLC]{1,6}\.|[A-Z]\))\s+\p{Lu}/u;
const NAMED_HEADING = /^(cap[ií]tulo|secci[oó]n|art[ií]culo|anexo|t[ií]tulo|parte)\b/i;

/** ¿La línea parece un título de sección? (corta, sin punto final y con forma de título) */
export function isHeadingLine(line: string): boolean {
  const text = line.trim();
  if (!text || text.length > 100 || /[.,;:]$/.test(text)) return false;
  if (/^#{1,6}\s+\S/.test(text)) return true;
  if (NAMED_HEADING.test(text)) return true;
  if (NUMBERED_HEADING.test(text) && text.length <= 80) return true;
  const letters = text.match(/\p{L}/gu) ?? [];
  const upper = text.match(/\p{Lu}/gu) ?? [];
  return letters.length >= 4 && upper.length / letters.length >= 0.7;
}

function cleanHeading(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .trim()
    .slice(0, HEADING_MAX_CHARS);
}

/** Une las líneas de una página en párrafos (los PDF suelen cortar cada línea). */
export function splitParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  for (const part of text.split(/\n\s*\n/)) {
    let current = "";
    for (const raw of part.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (!current) {
        current = line;
        continue;
      }
      const startsNew =
        isHeadingLine(line) ||
        isHeadingLine(current) ||
        LIST_ITEM.test(line) ||
        /[.!?:;»”)]$/.test(current);
      if (startsNew) {
        paragraphs.push(current);
        current = line;
      } else if (/\p{L}-$/u.test(current) && /^\p{Ll}/u.test(line)) {
        // Palabra partida con guion al final de la línea.
        current = current.slice(0, -1) + line;
      } else {
        current = `${current} ${line}`;
      }
    }
    if (current) paragraphs.push(current);
  }
  return paragraphs;
}

/** Parte un párrafo largo por frases (y, si hace falta, por palabras). */
export function splitLongParagraph(text: string, max = BLOCK_MAX_CHARS): string[] {
  if (text.length <= max) return [text];
  const sentences = text.split(/(?<=[.!?])\s+(?=[\p{Lu}¿¡"«(\d])/u);
  const pieces: string[] = [];
  let current = "";
  const push = (piece: string) => {
    if (piece.length <= max) {
      pieces.push(piece);
      return;
    }
    let rest = piece;
    while (rest.length > max) {
      const cut = rest.lastIndexOf(" ", max);
      const at = cut > max / 2 ? cut : max;
      pieces.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) pieces.push(rest);
  };
  for (const sentence of sentences) {
    if (!current) current = sentence;
    else if (current.length + 1 + sentence.length <= max) current = `${current} ${sentence}`;
    else {
      push(current);
      current = sentence;
    }
  }
  if (current) push(current);
  return pieces;
}

export function chunkDocument(pages: readonly PageText[]): DocumentChunk[] {
  const paragraphs: Paragraph[] = pages.flatMap((page) =>
    splitParagraphs(page.text).map((text) => ({
      text,
      page: page.page,
      heading: isHeadingLine(text),
    })),
  );

  const chunks: DocumentChunk[] = [];
  let heading: string | null = null;
  let headingHasContent = false;
  let blocks: Block[] = [];
  let size = 0;

  const flush = () => {
    if (blocks.length === 0) return;
    const texts = blocks.map((block) => block.text);
    const pagesInChunk = blocks
      .map((block) => block.page)
      .filter((page): page is number => page !== null);
    const content = texts.join("\n\n");
    chunks.push({
      index: chunks.length,
      heading,
      blocks: texts,
      content,
      pageFrom: pagesInChunk.length ? Math.min(...pagesInChunk) : null,
      pageTo: pagesInChunk.length ? Math.max(...pagesInChunk) : null,
      tokenCount: Math.ceil(((heading?.length ?? 0) + content.length) / 3),
    });
    blocks = [];
    size = 0;
  };

  for (const paragraph of paragraphs) {
    if (paragraph.heading) {
      flush();
      const title = cleanHeading(paragraph.text);
      // Un título seguido de otro (p. ej. capítulo y apartado) se combina.
      heading =
        heading && !headingHasContent ? `${heading} › ${title}`.slice(0, HEADING_MAX_CHARS) : title;
      headingHasContent = false;
      continue;
    }
    for (const text of splitLongParagraph(paragraph.text)) {
      if (
        blocks.length > 0 &&
        (size + text.length > CHUNK_TARGET_CHARS || blocks.length >= MAX_BLOCKS_PER_CHUNK)
      ) {
        const last = blocks[blocks.length - 1]!;
        flush();
        if (last.text.length <= OVERLAP_MAX_CHARS) {
          blocks = [last];
          size = last.text.length;
        }
      }
      blocks.push({ text, page: paragraph.page });
      size += text.length;
      headingHasContent = true;
    }
  }
  flush();
  return chunks;
}

/** Texto con el que se calcula el embedding de un fragmento (título y sección incluidos). */
export function embeddingTextFor(documentTitle: string, chunk: DocumentChunk): string {
  return [documentTitle, chunk.heading, chunk.content].filter(Boolean).join("\n");
}

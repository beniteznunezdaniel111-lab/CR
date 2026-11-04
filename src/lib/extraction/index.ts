/**
 * Extracción de texto de PDF (unpdf) y DOCX (mammoth). Sin OCR: un PDF escaneado
 * (solo imágenes) no tiene texto y se rechaza con un error claro. Las imágenes
 * (p. ej. la foto de un CV) nunca se extraen: a la IA solo le llega texto.
 */
import { PDF_MIME, isSupportedMime } from "./mime";

export {
  DOCX_MIME,
  PDF_MIME,
  SUPPORTED_MIME_TYPES,
  type SupportedMime,
  isSupportedMime,
  mimeFromFilename,
} from "./mime";

/** Máximo de caracteres de texto extraído (unas 25 páginas). */
export const MAX_EXTRACTED_CHARS = 60_000;
/** Por debajo de este número de letras se considera que no hay texto (escaneo). */
const MIN_LETTERS = 40;

export type ExtractionErrorCode = "unsupported_type" | "no_text" | "too_long" | "unreadable";

export class ExtractionError extends Error {
  constructor(public readonly code: ExtractionErrorCode) {
    super(`extraction_${code}`);
    this.name = "ExtractionError";
  }
}

export function isExtractionError(error: unknown): error is ExtractionError {
  return error instanceof ExtractionError;
}

/** Normaliza el texto: NFC, saltos de línea, espacios sobrantes y líneas vacías repetidas. */
export function normalizeExtractedText(text: string): string {
  return text
    .normalize("NFC")
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.replace(/ {2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(data: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(data, { mergePages: true });
  return text;
}

async function extractDocx(data: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
  return result.value;
}

export async function extractDocumentText(
  data: Uint8Array,
  mime: string,
): Promise<{ text: string }> {
  if (!isSupportedMime(mime)) throw new ExtractionError("unsupported_type");

  let raw: string;
  try {
    raw = mime === PDF_MIME ? await extractPdf(data) : await extractDocx(data);
  } catch {
    throw new ExtractionError("unreadable");
  }

  const text = normalizeExtractedText(raw);
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters < MIN_LETTERS) throw new ExtractionError("no_text");
  if (text.length > MAX_EXTRACTED_CHARS) throw new ExtractionError("too_long");
  return { text };
}

/** Máximo de texto de un documento de la FAQ (unas 200 páginas). */
export const MAX_DOCUMENT_CHARS = 600_000;

export type PageText = {
  /** Número de página (1, 2...) en PDF; null en DOCX, que no tiene páginas fijas. */
  page: number | null;
  text: string;
};

/**
 * Texto de un documento conservando las páginas (para citar "pág. N").
 * Mismas reglas que extractDocumentText: sin OCR y con límite de tamaño.
 */
export async function extractDocumentPages(
  data: Uint8Array,
  mime: string,
): Promise<{ pages: PageText[]; totalPages: number | null }> {
  if (!isSupportedMime(mime)) throw new ExtractionError("unsupported_type");

  let pages: PageText[];
  let totalPages: number | null = null;
  try {
    if (mime === PDF_MIME) {
      const { extractText } = await import("unpdf");
      const result = await extractText(data, { mergePages: false });
      totalPages = result.totalPages;
      pages = result.text.map((text, index) => ({ page: index + 1, text }));
    } else {
      pages = [{ page: null, text: await extractDocx(data) }];
    }
  } catch {
    throw new ExtractionError("unreadable");
  }

  const normalized = pages
    .map((page) => ({ page: page.page, text: normalizeExtractedText(page.text) }))
    .filter((page) => page.text.length > 0);
  const all = normalized.map((page) => page.text).join("\n");
  const letters = all.match(/\p{L}/gu)?.length ?? 0;
  if (letters < MIN_LETTERS) throw new ExtractionError("no_text");
  if (all.length > MAX_DOCUMENT_CHARS) throw new ExtractionError("too_long");
  return { pages: normalized, totalPages };
}

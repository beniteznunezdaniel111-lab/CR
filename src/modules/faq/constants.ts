import { Constants } from "@/lib/supabase/database.types";

export const KB_BUCKET = "kb-documents";
/** Igual que el límite del bucket kb-documents (25 MB). */
export const KB_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const KB_DOC_TYPES = Constants.public.Enums.kb_doc_type;
export type KbDocType = (typeof KB_DOC_TYPES)[number];
/** Tope de fragmentos por documento (unas 250 páginas de texto). */
export const KB_MAX_CHUNKS = 400;
/** Un procesado que lleva más de esto "en curso" se considera atascado. */
export const KB_PROCESSING_STALE_MS = 5 * 60 * 1000;

export const QUESTION_MIN = 2;
export const QUESTION_MAX = 1000;
export const HR_QUERY_MIN = 5;
export const HR_QUERY_MAX = 2000;
export const HR_ANSWER_MAX = 4000;
/** Fragmentos que se envían a la IA como máximo. */
export const MATCH_COUNT = 6;
/** Las conversaciones se borran tras 12 meses sin actividad. */
export const FAQ_RETENTION_MONTHS = 12;

/** Motivos por los que falla el procesado de un documento (columna kb_documents.error). */
export const KB_PROCESSING_ERRORS = [
  "unsupported_type",
  "no_text",
  "too_long",
  "unreadable",
  "storage_error",
  "save_failed",
  "embeddings_failed",
  "budget_exceeded",
  "not_configured",
] as const;
export type KbProcessingError = (typeof KB_PROCESSING_ERRORS)[number];

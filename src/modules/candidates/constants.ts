import { DOCX_MIME, PDF_MIME } from "@/lib/extraction/mime";
import { Constants } from "@/lib/supabase/database.types";

export const CANDIDATE_STATUSES = Constants.public.Enums.candidate_status;
export const PROCESSING_STATUSES = Constants.public.Enums.cv_processing_status;
export const MATCH_RESULTS = Constants.public.Enums.requirement_match;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];
export type MatchResult = (typeof MATCH_RESULTS)[number];

/** CVs por subida (decisión del plan) y tamaño máximo (límite del bucket). */
export const MAX_FILES_PER_UPLOAD = 20;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const CV_MIME_TYPES = [PDF_MIME, DOCX_MIME] as const;
export const CV_ACCEPT =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Motivo para revelar la identidad (lo exige también la base de datos). */
export const REVEAL_REASON_MIN = 10;
export const REVEAL_REASON_MAX = 500;
export const DECISION_COMMENT_MAX = 1000;

/** Un procesado que lleva más de esto "en curso" se considera interrumpido. */
export const PROCESSING_STALE_MS = 10 * 60 * 1000;

/** Errores de procesado que se muestran a RRHH (claves de candidates.processingErrors). */
export const PROCESSING_ERRORS = [
  "no_text",
  "too_long",
  "unreadable",
  "unsupported_type",
  "file_missing",
  "no_requirements",
  "budget_exceeded",
  "ai_error",
  "unexpected",
] as const;
export type ProcessingError = (typeof PROCESSING_ERRORS)[number];

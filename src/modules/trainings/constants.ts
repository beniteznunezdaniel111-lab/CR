/** Nota mínima para aprobar el test (la misma que usa submit_training_attempt). */
export const TRAINING_PASS_SCORE = 70;
export const MODULE_COUNT = { min: 2, max: 8, default: 4 } as const;
export const QUESTION_COUNT = { min: 3, max: 15, default: 8 } as const;
/** Texto de las fuentes que se envía a la IA (repartido entre los documentos). */
export const MAX_SOURCE_CHARS = 60_000;
/** Texto que se guarda de cada fuente (instantánea). */
export const MAX_STORED_SOURCE_CHARS = 200_000;
export const MAX_KB_SOURCES = 10;
export const MAX_UPLOAD_SOURCES = 5;
export const TRAINING_BUCKET = "training-sources";
export const TRAINING_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_MODULES = 30;
export const MAX_QUESTIONS = 30;

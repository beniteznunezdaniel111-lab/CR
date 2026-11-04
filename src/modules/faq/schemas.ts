import { z } from "zod";
import {
  HR_ANSWER_MAX,
  HR_QUERY_MAX,
  HR_QUERY_MIN,
  KB_DOC_TYPES,
  KB_MAX_FILE_BYTES,
  QUESTION_MAX,
  QUESTION_MIN,
} from "./constants";

// Los mensajes son claves de messages/es.json → "validation".

export const askSchema = z.object({
  orgId: z.uuid(),
  conversationId: z.uuid().nullish(),
  question: z
    .string()
    .trim()
    .min(QUESTION_MIN, { error: "questionLength" })
    .max(QUESTION_MAX, { error: "questionLength" }),
});
export type AskInput = z.infer<typeof askSchema>;

export const kbUploadSchema = z.object({
  orgId: z.uuid(),
  title: z.string().trim().min(2, { error: "docTitle" }).max(200, { error: "docTitle" }),
  docType: z.enum(KB_DOC_TYPES, { error: "invalid" }),
  file: z.object({
    name: z.string().trim().min(1).max(255),
    size: z.number().int().positive().max(KB_MAX_FILE_BYTES),
    type: z.string().max(200),
  }),
});
export type KbUploadInput = z.infer<typeof kbUploadSchema>;

export const kbDocumentRefSchema = z.object({ orgId: z.uuid(), documentId: z.uuid() });
export type KbDocumentRef = z.infer<typeof kbDocumentRefSchema>;

export const conversationRefSchema = z.object({ orgId: z.uuid(), conversationId: z.uuid() });

export const hrQuerySchema = z.object({
  orgId: z.uuid(),
  question: z
    .string()
    .trim()
    .min(HR_QUERY_MIN, { error: "hrQueryLength" })
    .max(HR_QUERY_MAX, { error: "hrQueryLength" }),
});

export const hrAnswerSchema = z.object({
  orgId: z.uuid(),
  queryId: z.uuid(),
  answer: z
    .string()
    .trim()
    .min(2, { error: "answerLength" })
    .max(HR_ANSWER_MAX, { error: "answerLength" }),
});

export const notificationsReadSchema = z.object({
  orgId: z.uuid(),
  ids: z.array(z.uuid()).max(100).optional(),
});

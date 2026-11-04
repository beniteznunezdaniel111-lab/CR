import { z } from "zod";
import {
  CANDIDATE_STATUSES,
  DECISION_COMMENT_MAX,
  MAX_FILE_BYTES,
  MAX_FILES_PER_UPLOAD,
  REVEAL_REASON_MAX,
  REVEAL_REASON_MIN,
} from "./constants";

// Los mensajes son claves de messages/es.json → "validation".

export const uploadRequestSchema = z.object({
  orgId: z.uuid(),
  jobId: z.uuid(),
  files: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(255),
        size: z.number().int().positive().max(MAX_FILE_BYTES),
        type: z.string().max(200),
      }),
    )
    .min(1)
    .max(MAX_FILES_PER_UPLOAD),
});
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export const candidateRefSchema = z.object({ orgId: z.uuid(), candidateId: z.uuid() });
export type CandidateRef = z.infer<typeof candidateRefSchema>;

export const statusChangeSchema = candidateRefSchema.extend({
  status: z.enum(CANDIDATE_STATUSES),
  comment: z
    .string()
    .trim()
    .max(DECISION_COMMENT_MAX, { error: "tooLong" })
    .optional()
    .transform((value) => (value ? value : undefined)),
});
export type StatusChange = z.input<typeof statusChangeSchema>;

export const revealSchema = candidateRefSchema.extend({
  reason: z
    .string()
    .trim()
    .min(REVEAL_REASON_MIN, { error: "revealReason" })
    .max(REVEAL_REASON_MAX, { error: "revealReason" }),
});
export type RevealRequest = z.input<typeof revealSchema>;

export const DELETE_REASONS = ["candidate_request", "manual", "upload_failed"] as const;
export type DeleteReason = (typeof DELETE_REASONS)[number];

export const deleteCandidateSchema = candidateRefSchema.extend({
  reason: z.enum(DELETE_REASONS),
});

export const anonymousReviewSchema = z.object({
  orgId: z.uuid(),
  jobId: z.uuid(),
  enabled: z.boolean(),
});

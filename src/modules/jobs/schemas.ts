import { z } from "zod";
import {
  JOB_LEVELS,
  JOB_STATUSES,
  JOB_TONES,
  MAX_REQUIREMENTS,
  REQUIREMENT_KINDS,
  SALARY_PERIODS,
  WORK_MODES,
} from "./constants";

// Los mensajes son claves de messages/es.json → "validation".

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .optional()
    .transform((value) => (value ? value : undefined));

/** Importe opcional: vacío → undefined; si no, número ≥ 0. */
const optionalAmount = z
  .string()
  .trim()
  .optional()
  .transform((value, ctx) => {
    if (!value) return undefined;
    const amount = Number(value.replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e10) {
      ctx.addIssue({ code: "custom", message: "salaryAmount" });
      return z.NEVER;
    }
    return amount;
  });

export const requirementInputSchema = z.object({
  id: z
    .string()
    .optional()
    .transform((value) => (value && z.uuid().safeParse(value).success ? value : undefined)),
  text: z
    .string()
    .trim()
    .min(2, { error: "requirementLength" })
    .max(500, { error: "requirementLength" }),
  kind: z.enum(REQUIREMENT_KINDS, { error: "required" }),
});

export type RequirementInput = z.infer<typeof requirementInputSchema>;

/** Lista de requisitos que llega serializada en un campo oculto del formulario. */
const requirementsField = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid" });
      return z.NEVER;
    }
  })
  .pipe(z.array(requirementInputSchema).max(MAX_REQUIREMENTS, { error: "tooManyRequirements" }));

export const jobFormSchema = z
  .object({
    orgId: z.uuid(),
    jobId: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined))
      .pipe(z.uuid().optional()),
    title: z
      .string()
      .trim()
      .min(2, { error: "jobTitleLength" })
      .max(150, { error: "jobTitleLength" }),
    department: optionalText(120),
    level: z.enum(JOB_LEVELS, { error: "required" }),
    workMode: z.enum(WORK_MODES, { error: "required" }),
    location: optionalText(150),
    responsibilities: z
      .string()
      .trim()
      .min(10, { error: "responsibilitiesLength" })
      .max(6000, { error: "tooLong" }),
    requirements: requirementsField,
    salaryMin: optionalAmount,
    salaryMax: optionalAmount,
    salaryCurrency: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined))
      .pipe(z.enum(["EUR", "CRC", "USD"]).optional()),
    salaryPeriod: z
      .string()
      .optional()
      .transform((value) => (value ? value : undefined))
      .pipe(z.enum(SALARY_PERIODS).optional()),
    benefits: optionalText(4000),
    tone: z.enum(JOB_TONES).default("professional"),
  })
  .superRefine((value, ctx) => {
    if (
      value.salaryMin !== undefined &&
      value.salaryMax !== undefined &&
      value.salaryMax < value.salaryMin
    ) {
      ctx.addIssue({ code: "custom", path: ["salaryMax"], message: "salaryRange" });
    }
    const hasAmount = value.salaryMin !== undefined || value.salaryMax !== undefined;
    if (hasAmount && (!value.salaryCurrency || !value.salaryPeriod)) {
      ctx.addIssue({ code: "custom", path: ["salaryCurrency"], message: "salaryUnit" });
    }
  });

export type JobFormInput = z.infer<typeof jobFormSchema>;

export const jobRefSchema = z.object({ orgId: z.uuid(), jobId: z.uuid() });

export const jobStatusSchema = jobRefSchema.extend({ status: z.enum(JOB_STATUSES) });

const docText = z.string().max(20000, { error: "tooLong" });

export const saveVersionSchema = jobRefSchema.extend({
  internal: docText,
  linkedin: docText,
  jobBoard: docText,
  website: docText,
});

export const versionRefSchema = jobRefSchema.extend({
  versionNumber: z.coerce.number().int().positive(),
});

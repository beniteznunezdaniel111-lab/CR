import { Constants } from "@/lib/supabase/database.types";

export const JOB_LEVELS = Constants.public.Enums.job_level;
export const WORK_MODES = Constants.public.Enums.work_mode;
export const JOB_STATUSES = Constants.public.Enums.job_status;
export const JOB_TONES = Constants.public.Enums.job_tone;
export const REQUIREMENT_KINDS = Constants.public.Enums.requirement_kind;

export type JobLevel = (typeof JOB_LEVELS)[number];
export type WorkMode = (typeof WORK_MODES)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
export type JobTone = (typeof JOB_TONES)[number];
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const SALARY_PERIODS = ["year", "month"] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

/** Los cuatro textos de cada versión y su columna en la base de datos. */
export const JOB_DOCS = ["internal", "linkedin", "jobBoard", "website"] as const;
export type JobDoc = (typeof JOB_DOCS)[number];

export const JOB_DOC_COLUMNS = {
  internal: "internal_description_md",
  linkedin: "offer_linkedin_md",
  jobBoard: "offer_portal_md",
  website: "offer_web_md",
} as const satisfies Record<JobDoc, string>;

export const MAX_REQUIREMENTS = 30;

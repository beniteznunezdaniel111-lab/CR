"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { type AiCallContext, generateObject, isAiError } from "@/lib/ai";
import { requireHrContext } from "@/lib/auth/hr-context";
import { jobGenerateV1 } from "@/lib/ai/prompts/jobs/generate.v1";
import { jobInclusiveReviewV1 } from "@/lib/ai/prompts/jobs/inclusive-review.v1";
import { recordAuditEvent } from "@/lib/audit";
import type { Json } from "@/lib/supabase/database.types";
import { type FormState, formDataToObject, formError, zodFieldErrors } from "@/lib/forms";
import { JOB_DOC_COLUMNS, type JobDoc } from "./constants";
import { toPromptInput } from "./format";
import { type AiFinding, type JobDocs, buildInclusiveReview } from "./inclusive-review";
import { getJob, getJobVersion } from "./queries";
import {
  jobFormSchema,
  jobRefSchema,
  jobStatusSchema,
  saveVersionSchema,
  versionRefSchema,
} from "./schemas";

function jobPath(slug: string, jobId?: string) {
  return jobId ? `/app/${slug}/jobs/${jobId}` : `/app/${slug}/jobs`;
}

function docsFromVersion(version: Record<string, unknown>): JobDocs {
  return {
    internal: String(version[JOB_DOC_COLUMNS.internal] ?? ""),
    linkedin: String(version[JOB_DOC_COLUMNS.linkedin] ?? ""),
    jobBoard: String(version[JOB_DOC_COLUMNS.jobBoard] ?? ""),
    website: String(version[JOB_DOC_COLUMNS.website] ?? ""),
  };
}

function docsToColumns(docs: JobDocs) {
  return {
    internal_description_md: docs.internal,
    offer_linkedin_md: docs.linkedin,
    offer_portal_md: docs.jobBoard,
    offer_web_md: docs.website,
  };
}

// ---------------------------------------------------------------------------
// Datos del puesto
// ---------------------------------------------------------------------------
export async function saveJobAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("jobs");
  const raw = formDataToObject(formData);
  const parsed = jobFormSchema.safeParse(raw);
  if (!parsed.success) return formError(formData, { fieldErrors: zodFieldErrors(parsed.error) });
  const input = parsed.data;

  const hr = await requireHrContext(input.orgId);
  if (!hr) return formError(formData, { message: t("errors.forbidden") });

  const { data: jobId, error } = await hr.supabase.rpc("save_job_position", {
    p_org_id: input.orgId,
    p_job_id: input.jobId,
    p_fields: {
      title: input.title,
      department: input.department ?? "",
      level: input.level,
      work_mode: input.workMode,
      location: input.location ?? "",
      responsibilities: input.responsibilities,
      salary_min: input.salaryMin?.toString() ?? "",
      salary_max: input.salaryMax?.toString() ?? "",
      salary_currency:
        input.salaryMin !== undefined || input.salaryMax !== undefined
          ? (input.salaryCurrency ?? "")
          : "",
      salary_period:
        input.salaryMin !== undefined || input.salaryMax !== undefined
          ? (input.salaryPeriod ?? "")
          : "",
      benefits: input.benefits ?? "",
      tone: input.tone,
    },
    p_requirements: input.requirements.map((req) => ({
      id: req.id ?? "",
      text: req.text,
      kind: req.kind,
    })),
  });
  if (error || !jobId) return formError(formData, { message: t("errors.save") });

  await recordAuditEvent({
    orgId: input.orgId,
    actorId: hr.user.id,
    action: input.jobId ? "job.updated" : "job.created",
    entityType: "job",
    entityId: jobId,
    details: { requirements: input.requirements.length },
  });

  revalidatePath(jobPath(hr.org.slug));
  redirect(jobPath(hr.org.slug, jobId));
}

export async function setJobStatusAction(formData: FormData): Promise<FormState> {
  const t = await getTranslations("jobs");
  const parsed = jobStatusSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const { data, error } = await hr.supabase
    .from("job_positions")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.jobId)
    .eq("org_id", parsed.data.orgId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { status: "error", message: t("errors.generic") };

  await recordAuditEvent({
    orgId: parsed.data.orgId,
    actorId: hr.user.id,
    action: "job.status_changed",
    entityType: "job",
    entityId: parsed.data.jobId,
    details: { to: parsed.data.status },
  });
  revalidatePath(jobPath(hr.org.slug, parsed.data.jobId));
  revalidatePath(jobPath(hr.org.slug));
  return { status: "success", message: t("statusChanged") };
}

export async function deleteJobAction(formData: FormData): Promise<FormState> {
  const t = await getTranslations("jobs");
  const parsed = jobRefSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const { data, error } = await hr.supabase
    .from("job_positions")
    .delete()
    .eq("id", parsed.data.jobId)
    .eq("org_id", parsed.data.orgId)
    .select("id")
    .maybeSingle();
  if (error?.code === "23503") return { status: "error", message: t("errors.hasCandidates") };
  if (error || !data) return { status: "error", message: t("errors.generic") };

  await recordAuditEvent({
    orgId: parsed.data.orgId,
    actorId: hr.user.id,
    action: "job.deleted",
    entityType: "job",
    entityId: parsed.data.jobId,
  });
  revalidatePath(jobPath(hr.org.slug));
  redirect(jobPath(hr.org.slug));
}

// ---------------------------------------------------------------------------
// Contenido (versiones)
// ---------------------------------------------------------------------------

/** Revisión con IA; si falla, se devuelve null y queda solo la revisión por reglas. */
async function runAiReview(docs: JobDocs, aiContext: AiCallContext) {
  try {
    const { data, meta } = await generateObject(jobInclusiveReviewV1, docs, aiContext);
    return { findings: data.findings as AiFinding[], meta };
  } catch (error) {
    console.error(
      "[jobs] Revisión inclusiva con IA fallida:",
      isAiError(error) ? error.code : error,
    );
    return null;
  }
}

export type GenerateResult = { versionNumber: number };

export async function generateJobContentAction(
  formData: FormData,
): Promise<FormState<GenerateResult>> {
  const t = await getTranslations("jobs");
  const parsed = jobRefSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const job = await getJob(parsed.data.orgId, parsed.data.jobId);
  if (!job) return { status: "error", message: t("errors.notFound") };

  let generated;
  try {
    generated = await generateObject(jobGenerateV1, toPromptInput(job, hr.country), hr.aiContext);
  } catch (error) {
    return { status: "error", message: isAiError(error) ? error.userMessage : t("errors.generic") };
  }

  const docs: JobDocs = {
    internal: generated.data.internalDescription,
    linkedin: generated.data.offers.linkedin,
    jobBoard: generated.data.offers.jobBoard,
    website: generated.data.offers.website,
  };
  const ai = await runAiReview(docs, hr.aiContext);
  const review = buildInclusiveReview({
    docs,
    country: hr.country,
    job,
    aiFindings: ai?.findings ?? null,
  });

  const { data: version, error } = await hr.supabase
    .from("job_position_versions")
    .insert({
      org_id: job.org_id,
      job_id: job.id,
      source: "ai",
      ...docsToColumns(docs),
      inclusive_review: review as unknown as Json,
      inclusive_reviewed_at: review.reviewedAt,
      prompt_id: generated.meta.promptId,
      prompt_version: generated.meta.promptVersion,
      model: generated.meta.model,
      ai_usage_id: generated.meta.usageId,
    })
    .select("version_number")
    .single();
  if (error || !version) return { status: "error", message: t("errors.save") };

  await recordAuditEvent({
    orgId: job.org_id,
    actorId: hr.user.id,
    action: "job.content_generated",
    entityType: "job",
    entityId: job.id,
    details: {
      version: version.version_number,
      prompt: `${generated.meta.promptId}@${generated.meta.promptVersion}`,
      model: generated.meta.model,
      ai_usage_id: generated.meta.usageId,
    },
  });
  if (ai) {
    await recordAuditEvent({
      orgId: job.org_id,
      actorId: hr.user.id,
      action: "job.inclusive_reviewed",
      entityType: "job",
      entityId: job.id,
      details: {
        version: version.version_number,
        prompt: `${ai.meta.promptId}@${ai.meta.promptVersion}`,
        model: ai.meta.model,
        findings: review.findings.length,
      },
    });
  }

  revalidatePath(jobPath(hr.org.slug, job.id));
  return { status: "success", data: { versionNumber: version.version_number } };
}

export async function saveJobVersionAction(formData: FormData): Promise<FormState<GenerateResult>> {
  const t = await getTranslations("jobs");
  const parsed = saveVersionSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("errors.tooLong") };
  const { orgId, jobId, ...docs } = parsed.data;
  const hr = await requireHrContext(orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const [job, latest] = await Promise.all([getJob(orgId, jobId), getJobVersion(orgId, jobId)]);
  if (!job) return { status: "error", message: t("errors.notFound") };
  if (latest) {
    const current = docsFromVersion(latest);
    const unchanged = (Object.keys(docs) as JobDoc[]).every(
      (key) => current[key].trim() === docs[key].trim(),
    );
    if (unchanged) return { status: "error", message: t("errors.noChanges") };
  }

  // Al editar a mano se revisa al instante con las reglas; la IA, a petición.
  const review = buildInclusiveReview({ docs, country: hr.country, job, aiFindings: null });
  const { data: version, error } = await hr.supabase
    .from("job_position_versions")
    .insert({
      org_id: orgId,
      job_id: jobId,
      source: "manual",
      ...docsToColumns(docs),
      inclusive_review: review as unknown as Json,
      inclusive_reviewed_at: review.reviewedAt,
    })
    .select("version_number")
    .single();
  if (error || !version) return { status: "error", message: t("errors.save") };

  await recordAuditEvent({
    orgId,
    actorId: hr.user.id,
    action: "job.version_saved",
    entityType: "job",
    entityId: jobId,
    details: { version: version.version_number },
  });
  revalidatePath(jobPath(hr.org.slug, jobId));
  return {
    status: "success",
    message: t("versionSaved", { version: version.version_number }),
    data: { versionNumber: version.version_number },
  };
}

export async function restoreJobVersionAction(
  formData: FormData,
): Promise<FormState<GenerateResult>> {
  const t = await getTranslations("jobs");
  const parsed = versionRefSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const { orgId, jobId, versionNumber } = parsed.data;
  const hr = await requireHrContext(orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const source = await getJobVersion(orgId, jobId, versionNumber);
  if (!source) return { status: "error", message: t("errors.notFound") };

  const { data: version, error } = await hr.supabase
    .from("job_position_versions")
    .insert({
      org_id: orgId,
      job_id: jobId,
      source: "restored",
      restored_from_version: versionNumber,
      ...docsToColumns(docsFromVersion(source)),
      // Mismos textos → misma revisión (incluida la de IA, si la tenía).
      inclusive_review: source.inclusive_review as unknown as Json,
      inclusive_reviewed_at: source.inclusive_reviewed_at,
    })
    .select("version_number")
    .single();
  if (error || !version) return { status: "error", message: t("errors.save") };

  await recordAuditEvent({
    orgId,
    actorId: hr.user.id,
    action: "job.version_restored",
    entityType: "job",
    entityId: jobId,
    details: { version: version.version_number, restored_from: versionNumber },
  });
  revalidatePath(jobPath(hr.org.slug, jobId));
  return {
    status: "success",
    message: t("versionRestored", { from: versionNumber, version: version.version_number }),
    data: { versionNumber: version.version_number },
  };
}

export async function reviewJobVersionWithAiAction(
  formData: FormData,
): Promise<FormState<GenerateResult>> {
  const t = await getTranslations("jobs");
  const parsed = versionRefSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const { orgId, jobId, versionNumber } = parsed.data;
  const hr = await requireHrContext(orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const [job, version] = await Promise.all([
    getJob(orgId, jobId),
    getJobVersion(orgId, jobId, versionNumber),
  ]);
  if (!job || !version) return { status: "error", message: t("errors.notFound") };

  const docs = docsFromVersion(version);
  let ai;
  try {
    const { data, meta } = await generateObject(jobInclusiveReviewV1, docs, hr.aiContext);
    ai = { findings: data.findings as AiFinding[], meta };
  } catch (error) {
    return { status: "error", message: isAiError(error) ? error.userMessage : t("errors.generic") };
  }
  const review = buildInclusiveReview({ docs, country: hr.country, job, aiFindings: ai.findings });

  const { error } = await hr.supabase
    .from("job_position_versions")
    .update({
      inclusive_review: review as unknown as Json,
      inclusive_reviewed_at: review.reviewedAt,
    })
    .eq("id", version.id)
    .eq("org_id", orgId);
  if (error) return { status: "error", message: t("errors.save") };

  await recordAuditEvent({
    orgId,
    actorId: hr.user.id,
    action: "job.inclusive_reviewed",
    entityType: "job",
    entityId: jobId,
    details: {
      version: versionNumber,
      prompt: `${ai.meta.promptId}@${ai.meta.promptVersion}`,
      model: ai.meta.model,
      findings: review.findings.length,
    },
  });
  revalidatePath(jobPath(hr.org.slug, jobId));
  return {
    status: "success",
    message: t("reviewDone", { count: review.findings.length }),
    data: { versionNumber },
  };
}

"use server";

/**
 * Acciones de candidaturas. Reglas del módulo:
 *   - La IA solo sugiere. Ninguna función de procesado llama a
 *     set_candidate_status: el estado lo cambia una persona (setCandidateStatusAction).
 *   - La clave de servidor solo se usa para el fichero del CV (URL firmada de
 *     subida, lectura para procesarlo y borrado), siempre después de comprobar con
 *     la sesión del usuario que es RRHH/admin de la empresa y ve la candidatura.
 *   - Todo queda en la auditoría, sin datos personales en `details`.
 */
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { generateObject, isAiError } from "@/lib/ai";
import { cvAnalysisV1 } from "@/lib/ai/prompts/cv/analysis.v1";
import { cvIdentityV1 } from "@/lib/ai/prompts/cv/identity.v1";
import { recordAuditEvent, recordAuditEvents } from "@/lib/audit";
import { type HrContext, requireHrContext } from "@/lib/auth/hr-context";
import {
  extractDocumentText,
  isExtractionError,
  isSupportedMime,
  mimeFromFilename,
} from "@/lib/extraction";
import type { FormState } from "@/lib/forms";
import { zodFieldErrors } from "@/lib/forms";
import {
  type CandidateIdentity,
  EMPTY_IDENTITY,
  detectContacts,
  redactCvText,
} from "@/lib/privacy/redaction";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { getJob } from "@/modules/jobs/queries";
import { buildAnalysis } from "./analysis";
import { PROCESSING_STALE_MS, type ProcessingError } from "./constants";
import {
  type CandidateRef,
  type DeleteReason,
  type RevealRequest,
  type StatusChange,
  type UploadRequest,
  anonymousReviewSchema,
  candidateRefSchema,
  deleteCandidateSchema,
  revealSchema,
  statusChangeSchema,
  uploadRequestSchema,
} from "./schemas";

const BUCKET = "cvs";

/** Revalida todas las páginas de puestos y candidaturas de la empresa. */
function revalidateCandidates(hr: HrContext) {
  revalidatePath(`/app/${hr.org.slug}/jobs`, "layout");
  revalidatePath(`/app/${hr.org.slug}/candidates`, "layout");
}

async function loadCandidate(hr: HrContext, orgId: string, candidateId: string) {
  const { data } = await hr.supabase
    .from("candidates")
    .select(
      "id, org_id, job_id, cv_path, cv_mime, redacted_text, processing_status, processing_started_at",
    )
    .eq("id", candidateId)
    .eq("org_id", orgId)
    .maybeSingle();
  return data;
}

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------
export type PreparedUpload = {
  candidateId: string;
  candidateNumber: number;
  path: string;
  token: string;
};

/**
 * Registra las candidaturas y devuelve, para cada fichero, una URL firmada de
 * subida a Storage (el navegador sube directo: sin el límite de tamaño de las
 * funciones). Hasta 20 CVs PDF/DOCX de máximo 10 MB.
 */
export async function prepareCvUploadsAction(
  input: UploadRequest,
): Promise<FormState<PreparedUpload[]>> {
  const t = await getTranslations("candidates");
  const parsed = uploadRequestSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.invalidFiles") };
  const { orgId, jobId, files } = parsed.data;

  const hr = await requireHrContext(orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const normalized: { filename: string; mime: string; size: number }[] = [];
  for (const file of files) {
    const mime = isSupportedMime(file.type) ? file.type : mimeFromFilename(file.name);
    if (!mime) return { status: "error", message: t("errors.fileType", { name: file.name }) };
    normalized.push({ filename: file.name, mime, size: file.size });
  }

  const job = await getJob(orgId, jobId);
  if (!job) return { status: "error", message: t("errors.notFound") };
  if (job.requirements.length === 0) {
    return { status: "error", message: t("errors.noRequirements") };
  }

  const { data: rows, error } = await hr.supabase.rpc("register_candidates", {
    p_job_id: jobId,
    p_files: normalized as unknown as Json,
  });
  if (error || !rows?.length) return { status: "error", message: t("errors.upload") };

  const admin = createAdminClient();
  const prepared: PreparedUpload[] = [];
  for (const row of rows) {
    const { data, error: signError } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(row.cv_path);
    if (signError || !data) {
      // Sin URL no se puede subir: se deshace el registro de toda la tanda.
      await hr.supabase
        .from("candidates")
        .delete()
        .in(
          "id",
          rows.map((item) => item.candidate_id),
        );
      return { status: "error", message: t("errors.upload") };
    }
    prepared.push({
      candidateId: row.candidate_id,
      candidateNumber: row.candidate_number,
      path: row.cv_path,
      token: data.token,
    });
  }

  await recordAuditEvents(
    rows.map((row, index) => ({
      orgId,
      actorId: hr.user.id,
      action: "candidate.uploaded",
      entityType: "candidate",
      entityId: row.candidate_id,
      details: { job_id: jobId, mime: normalized[index]!.mime, size: normalized[index]!.size },
    })),
  );
  revalidateCandidates(hr);
  return { status: "success", data: prepared };
}

// ---------------------------------------------------------------------------
// Procesado: extracción → anonimización → análisis (una petición por CV)
// ---------------------------------------------------------------------------
export type ProcessOutcome =
  { processing: "done" } | { processing: "failed"; error: ProcessingError; message: string };

export async function processCandidateAction(
  input: CandidateRef,
): Promise<FormState<ProcessOutcome>> {
  const t = await getTranslations("candidates");
  const parsed = candidateRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const { orgId, candidateId } = parsed.data;

  const hr = await requireHrContext(orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const candidate = await loadCandidate(hr, orgId, candidateId);
  if (!candidate) return { status: "error", message: t("errors.notFound") };

  // Reserva el procesado (evita dos análisis simultáneos del mismo CV).
  const staleBefore = new Date(Date.now() - PROCESSING_STALE_MS).toISOString();
  const { data: claimed } = await hr.supabase
    .from("candidates")
    .update({
      processing_status: "processing",
      processing_started_at: new Date().toISOString(),
      processing_error: null,
    })
    .eq("id", candidateId)
    .or(`processing_status.neq.processing,processing_started_at.lt."${staleBefore}"`)
    .select("id");
  if (!claimed?.length) return { status: "error", message: t("errors.alreadyProcessing") };

  const fail = async (code: ProcessingError): Promise<FormState<ProcessOutcome>> => {
    await hr.supabase
      .from("candidates")
      .update({ processing_status: "failed", processing_error: code })
      .eq("id", candidateId);
    await recordAuditEvent({
      orgId,
      actorId: hr.user.id,
      action: "candidate.analysis_failed",
      entityType: "candidate",
      entityId: candidateId,
      details: { job_id: candidate.job_id, error: code },
    });
    revalidateCandidates(hr);
    return {
      status: "success",
      data: { processing: "failed", error: code, message: t(`processingErrors.${code}`) },
    };
  };

  try {
    const job = await getJob(orgId, candidate.job_id);
    if (!job || job.requirements.length === 0) return await fail("no_requirements");

    let redacted = candidate.redacted_text;
    let identity: CandidateIdentity = EMPTY_IDENTITY;
    let identityPrompt: { id: string; version: number } | null = null;
    const usageIds: number[] = [];

    if (!redacted) {
      // El fichero se lee con la clave de servidor: en modo anónimo RRHH no
      // puede leer el CV original (RLS de Storage), pero sí procesarlo.
      const admin = createAdminClient();
      const { data: blob, error: downloadError } = await admin.storage
        .from(BUCKET)
        .download(candidate.cv_path);
      if (downloadError || !blob) return await fail("file_missing");

      let text: string;
      try {
        ({ text } = await extractDocumentText(
          new Uint8Array(await blob.arrayBuffer()),
          candidate.cv_mime,
        ));
      } catch (error) {
        if (isExtractionError(error)) return await fail(error.code);
        throw error;
      }

      const found = await generateObject(cvIdentityV1, { cvText: text }, hr.aiContext);
      if (found.meta.usageId) usageIds.push(found.meta.usageId);
      identityPrompt = { id: found.meta.promptId, version: found.meta.promptVersion };
      // Lo evidente (email, teléfono, enlaces) se oculta aunque la IA no lo vea.
      const fallback = detectContacts(text);
      identity = {
        fullName: found.data.fullName ?? fallback.fullName,
        email: found.data.email ?? fallback.email,
        phone: found.data.phone ?? fallback.phone,
        location: found.data.location,
        links: [...new Set([...found.data.links, ...fallback.links])].slice(0, 10),
      };
      redacted = redactCvText(text, identity).text;

      const { error: storeError } = await hr.supabase.rpc("store_candidate_extraction", {
        p_candidate_id: candidateId,
        p_identity: {
          full_name: identity.fullName,
          email: identity.email,
          phone: identity.phone,
          location: identity.location,
          links: identity.links,
        },
        p_redacted_text: redacted,
      });
      if (storeError) throw new Error(`store_candidate_extraction: ${storeError.message}`);
    }

    const requirements = job.requirements.map((req) => ({
      id: req.id,
      text: req.text,
      kind: req.kind,
    }));
    const run = await generateObject(
      cvAnalysisV1,
      {
        job: {
          title: job.title,
          level: job.level,
          responsibilities: job.responsibilities,
          requirements,
        },
        cvText: redacted,
      },
      hr.aiContext,
    );
    if (run.meta.usageId) usageIds.push(run.meta.usageId);

    const built = buildAnalysis({
      output: run.data,
      requirements,
      redactedText: redacted,
      identity,
      country: hr.country.code,
    });

    const { data: analysis, error: analysisError } = await hr.supabase
      .from("cv_analyses")
      .insert({
        org_id: orgId,
        candidate_id: candidateId,
        summary: built.summary,
        profile: built.profile as unknown as Json,
        interview_questions: built.questions as unknown as Json,
        requirements_snapshot: requirements as unknown as Json,
        required_met: built.counts.requiredMet,
        required_total: built.counts.requiredTotal,
        preferred_met: built.counts.preferredMet,
        preferred_total: built.counts.preferredTotal,
        guard_flags: built.guardFlags as unknown as Json,
        prompt_id: run.meta.promptId,
        prompt_version: run.meta.promptVersion,
        identity_prompt_id: identityPrompt?.id ?? null,
        identity_prompt_version: identityPrompt?.version ?? null,
        model: run.meta.model,
        ai_usage_ids: usageIds,
      })
      .select("id")
      .single();
    if (analysisError || !analysis) throw new Error(`cv_analyses: ${analysisError?.message}`);

    const { error: matchesError } = await hr.supabase.from("cv_requirement_matches").insert(
      built.matches.map((match) => ({
        org_id: orgId,
        analysis_id: analysis.id,
        requirement_id: match.requirementId,
        requirement_text: match.requirementText,
        requirement_kind: match.requirementKind,
        sort_order: match.sortOrder,
        result: match.result,
        evidence: match.evidence,
        evidence_verified: match.evidenceVerified,
        explanation: match.explanation,
      })),
    );
    if (matchesError) throw new Error(`cv_requirement_matches: ${matchesError.message}`);

    await hr.supabase
      .from("candidates")
      .update({ processing_status: "done", processing_error: null })
      .eq("id", candidateId);

    await recordAuditEvent({
      orgId,
      actorId: hr.user.id,
      action: "candidate.analyzed",
      entityType: "candidate",
      entityId: candidateId,
      details: {
        job_id: candidate.job_id,
        analysis_id: analysis.id,
        prompts: [
          ...(identityPrompt ? [`${identityPrompt.id}@${identityPrompt.version}`] : []),
          `${run.meta.promptId}@${run.meta.promptVersion}`,
        ],
        model: run.meta.model,
        ai_usage_ids: usageIds,
        required_met: built.counts.requiredMet,
        required_total: built.counts.requiredTotal,
        guard_flags: built.guardFlags.length,
      },
    });
    revalidateCandidates(hr);
    return { status: "success", data: { processing: "done" } };
  } catch (error) {
    if (isAiError(error)) {
      return await fail(error.code === "budget_exceeded" ? "budget_exceeded" : "ai_error");
    }
    console.error("[candidates] Error al procesar un CV:", error);
    return await fail("unexpected");
  }
}

// ---------------------------------------------------------------------------
// Decisiones humanas y revelado de identidad (RPCs auditadas)
// ---------------------------------------------------------------------------
export async function setCandidateStatusAction(input: StatusChange): Promise<FormState> {
  const t = await getTranslations("candidates");
  const parsed = statusChangeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: t("errors.generic"),
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const { error } = await hr.supabase.rpc("set_candidate_status", {
    p_candidate_id: parsed.data.candidateId,
    p_status: parsed.data.status,
    p_comment: parsed.data.comment,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "22023" ? t("errors.sameStatus") : t("errors.generic"),
    };
  }
  revalidateCandidates(hr);
  return { status: "success", message: t("decision.saved") };
}

export async function revealCandidateIdentityAction(input: RevealRequest): Promise<FormState> {
  const t = await getTranslations("candidates");
  const parsed = revealSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  }
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const { error } = await hr.supabase.rpc("reveal_candidate_identity", {
    p_candidate_id: parsed.data.candidateId,
    p_reason: parsed.data.reason,
  });
  if (error) return { status: "error", message: t("errors.reveal") };
  revalidateCandidates(hr);
  return { status: "success", message: t("identity.revealed") };
}

// ---------------------------------------------------------------------------
// Fichero original, modo anónimo y borrado
// ---------------------------------------------------------------------------

/** URL temporal (60 s) del CV original. La RLS de Storage la niega en modo anónimo. */
export async function getCvDownloadUrlAction(
  input: CandidateRef,
): Promise<FormState<{ url: string }>> {
  const t = await getTranslations("candidates");
  const parsed = candidateRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const candidate = await loadCandidate(hr, parsed.data.orgId, parsed.data.candidateId);
  if (!candidate) return { status: "error", message: t("errors.notFound") };

  const { data, error } = await hr.supabase.storage
    .from(BUCKET)
    .createSignedUrl(candidate.cv_path, 60);
  if (error || !data) return { status: "error", message: t("errors.cvHidden") };

  await recordAuditEvent({
    orgId: parsed.data.orgId,
    actorId: hr.user.id,
    action: "candidate.cv_viewed",
    entityType: "candidate",
    entityId: candidate.id,
    details: { job_id: candidate.job_id },
  });
  return { status: "success", data: { url: data.signedUrl } };
}

export async function setAnonymousReviewAction(input: {
  orgId: string;
  jobId: string;
  enabled: boolean;
}): Promise<FormState> {
  const t = await getTranslations("candidates");
  const parsed = anonymousReviewSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const { data, error } = await hr.supabase
    .from("job_positions")
    .update({ anonymous_review: parsed.data.enabled })
    .eq("id", parsed.data.jobId)
    .eq("org_id", parsed.data.orgId)
    .select("id")
    .maybeSingle();
  if (error?.code === "42501") return { status: "error", message: t("errors.anonymousLocked") };
  if (error || !data) return { status: "error", message: t("errors.generic") };
  revalidateCandidates(hr);
  return {
    status: "success",
    message: parsed.data.enabled ? t("anonymous.enabled") : t("anonymous.disabled"),
  };
}

/**
 * Borra una candidatura: fichero, datos identificativos, análisis e historial.
 * En la auditoría queda solo el evento con el motivo (seudónimo).
 */
export async function deleteCandidateAction(input: {
  orgId: string;
  candidateId: string;
  reason: DeleteReason;
}): Promise<FormState<{ jobId: string }>> {
  const t = await getTranslations("candidates");
  const parsed = deleteCandidateSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const { orgId, candidateId, reason } = parsed.data;
  const hr = await requireHrContext(orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const candidate = await loadCandidate(hr, orgId, candidateId);
  if (!candidate) return { status: "error", message: t("errors.notFound") };

  const admin = createAdminClient();
  const { error: storageError } = await admin.storage.from(BUCKET).remove([candidate.cv_path]);
  if (storageError) return { status: "error", message: t("errors.delete") };

  const { error } = await hr.supabase.from("candidates").delete().eq("id", candidateId);
  if (error) return { status: "error", message: t("errors.delete") };

  await recordAuditEvent({
    orgId,
    actorId: hr.user.id,
    action: "candidate.deleted",
    entityType: "candidate",
    entityId: candidateId,
    details: { job_id: candidate.job_id, reason },
  });
  revalidateCandidates(hr);
  return { status: "success", message: t("deleted"), data: { jobId: candidate.job_id } };
}

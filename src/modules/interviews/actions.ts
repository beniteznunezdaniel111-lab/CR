"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { generateObject, isAiError } from "@/lib/ai";
import { interviewGuideV1 } from "@/lib/ai/prompts/interviews/guide.v1";
import { recordAuditEvent } from "@/lib/audit";
import { requireHrContext } from "@/lib/auth/hr-context";
import type { FormState } from "@/lib/forms";
import type { Json } from "@/lib/supabase/database.types";
import { getJob } from "@/modules/jobs/queries";
import { sanitizeGuide } from "./guide";

const generateSchema = z.object({
  orgId: z.uuid(),
  jobId: z.uuid(),
  candidateId: z.uuid().optional(),
});

/**
 * Genera una guía de entrevista (siempre una nueva: las guías no se editan).
 * Con candidatura, usa su último análisis: resumen y requisitos parciales o que
 * no constan. Nunca datos identificativos.
 */
export async function generateInterviewGuideAction(input: {
  orgId: string;
  jobId: string;
  candidateId?: string;
}): Promise<FormState<{ guideId: string }>> {
  const t = await getTranslations("interviews");
  const parsed = generateSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const { orgId, jobId, candidateId } = parsed.data;
  const hr = await requireHrContext(orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const job = await getJob(orgId, jobId);
  if (!job) return { status: "error", message: t("errors.notFound") };
  const requirements = job.requirements.map((req) => ({
    id: req.id,
    text: req.text,
    kind: req.kind,
  }));

  let candidate: {
    summary: string;
    gaps: {
      requirementId: string;
      requirement: string;
      result: "partial" | "not_found";
      note: string;
    }[];
  } | null = null;
  if (candidateId) {
    const { data: analysis } = await hr.supabase
      .from("cv_analyses")
      .select(
        "summary, candidates!inner (job_id), cv_requirement_matches (requirement_id, requirement_text, result, explanation, sort_order)",
      )
      .eq("candidate_id", candidateId)
      .eq("org_id", orgId)
      .eq("candidates.job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!analysis) return { status: "error", message: t("errors.noAnalysis") };
    candidate = {
      summary: analysis.summary,
      gaps: [...analysis.cv_requirement_matches]
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter((match) => match.result !== "meets")
        .map((match) => ({
          requirementId: match.requirement_id ?? "",
          requirement: match.requirement_text,
          result: match.result as "partial" | "not_found",
          note: match.explanation,
        })),
    };
  }

  let run;
  try {
    run = await generateObject(
      interviewGuideV1,
      {
        job: {
          title: job.title,
          level: job.level,
          responsibilities: job.responsibilities,
          requirements,
        },
        candidate,
      },
      hr.aiContext,
    );
  } catch (error) {
    return { status: "error", message: isAiError(error) ? error.userMessage : t("errors.generic") };
  }

  const { content, guardFlags } = sanitizeGuide(run.data, {
    country: hr.country.code,
    requirementIds: requirements.map((req) => req.id),
  });

  const { data: guide, error } = await hr.supabase
    .from("interview_guides")
    .insert({
      org_id: orgId,
      job_id: jobId,
      candidate_id: candidateId ?? null,
      content: content as unknown as Json,
      focus_requirements: (candidate?.gaps.map((gap) => ({
        id: gap.requirementId,
        text: gap.requirement,
        result: gap.result,
      })) ?? []) as unknown as Json,
      guard_flags: guardFlags as unknown as Json,
      prompt_id: run.meta.promptId,
      prompt_version: run.meta.promptVersion,
      model: run.meta.model,
      ai_usage_id: run.meta.usageId,
    })
    .select("id")
    .single();
  if (error || !guide) return { status: "error", message: t("errors.save") };

  await recordAuditEvent({
    orgId,
    actorId: hr.user.id,
    action: "interview_guide.generated",
    entityType: "interview_guide",
    entityId: guide.id,
    details: {
      job_id: jobId,
      candidate_id: candidateId ?? null,
      prompt: `${run.meta.promptId}@${run.meta.promptVersion}`,
      model: run.meta.model,
      ai_usage_id: run.meta.usageId,
      guard_flags: guardFlags.length,
    },
  });
  revalidatePath(`/app/${hr.org.slug}/jobs/${jobId}/interview`);
  return { status: "success", message: t("generated"), data: { guideId: guide.id } };
}

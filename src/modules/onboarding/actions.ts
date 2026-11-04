"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { generateObject, isAiError } from "@/lib/ai";
import { onboardingPlanV1 } from "@/lib/ai/prompts/onboarding/plan.v1";
import { recordAuditEvent } from "@/lib/audit";
import { requireHrContext } from "@/lib/auth/hr-context";
import { type FormState, formDataToObject, formError, zodFieldErrors } from "@/lib/forms";
import type { Json } from "@/lib/supabase/database.types";
import { getJob } from "@/modules/jobs/queries";
import { tasksFromAi } from "./plan";
import {
  assignSchema,
  assignmentRefSchema,
  planFormSchema,
  planRefSchema,
  taskDoneSchema,
} from "./schemas";

const onboardingPath = (slug: string, path = "") => `/app/${slug}/onboarding${path}`;

/** Genera con IA un plan 30/60/90 para un puesto y lo guarda como plan editable. */
export async function generateOnboardingPlanAction(input: {
  orgId: string;
  jobId: string;
}): Promise<FormState<{ planId: string }>> {
  const t = await getTranslations("onboarding");
  const parsed = z.object({ orgId: z.uuid(), jobId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const { orgId, jobId } = parsed.data;
  const hr = await requireHrContext(orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const job = await getJob(orgId, jobId);
  if (!job) return { status: "error", message: t("errors.notFound") };

  let run;
  try {
    run = await generateObject(
      onboardingPlanV1,
      {
        title: job.title,
        level: job.level,
        department: job.department,
        workMode: job.work_mode,
        location: job.location,
        responsibilities: job.responsibilities,
        requirements: job.requirements.map((req) => ({ text: req.text, kind: req.kind })),
      },
      hr.aiContext,
    );
  } catch (error) {
    return { status: "error", message: isAiError(error) ? error.userMessage : t("errors.generic") };
  }

  const { data: planId, error } = await hr.supabase.rpc("save_onboarding_plan", {
    p_org_id: orgId,
    p_job_id: jobId,
    p_title: run.data.title,
    p_intro: run.data.intro,
    p_tasks: tasksFromAi(run.data.tasks) as unknown as Json,
    p_meta: {
      prompt_id: run.meta.promptId,
      prompt_version: run.meta.promptVersion,
      model: run.meta.model,
      ai_usage_id: run.meta.usageId,
    },
  });
  if (error || !planId) return { status: "error", message: t("errors.save") };

  await recordAuditEvent({
    orgId,
    actorId: hr.user.id,
    action: "onboarding.plan_generated",
    entityType: "onboarding",
    entityId: planId,
    details: {
      job_id: jobId,
      prompt: `${run.meta.promptId}@${run.meta.promptVersion}`,
      model: run.meta.model,
      ai_usage_id: run.meta.usageId,
    },
  });
  revalidatePath(onboardingPath(hr.org.slug), "layout");
  return { status: "success", data: { planId } };
}

/** Guarda los cambios del editor (título, introducción y tareas). */
export async function saveOnboardingPlanAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("onboarding");
  const parsed = planFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return formError(formData, {
      message: t("errors.invalidPlan"),
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }
  const { orgId, planId, title, intro, tasks } = parsed.data;
  const hr = await requireHrContext(orgId);
  if (!hr) return formError(formData, { message: t("errors.forbidden") });

  const { data: plan } = await hr.supabase
    .from("onboarding_plans")
    .select("job_id")
    .eq("id", planId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!plan) return formError(formData, { message: t("errors.notFound") });

  const { error } = await hr.supabase.rpc("save_onboarding_plan", {
    p_org_id: orgId,
    p_job_id: plan.job_id,
    p_title: title,
    p_intro: intro,
    p_tasks: tasks as unknown as Json,
    p_plan_id: planId,
  });
  if (error) return formError(formData, { message: t("errors.save") });

  await recordAuditEvent({
    orgId,
    actorId: hr.user.id,
    action: "onboarding.plan_updated",
    entityType: "onboarding",
    entityId: planId,
    details: { tasks: tasks.length },
  });
  revalidatePath(onboardingPath(hr.org.slug), "layout");
  return { status: "success", message: t("plan.saved") };
}

export async function deleteOnboardingPlanAction(input: {
  orgId: string;
  planId: string;
}): Promise<FormState> {
  const t = await getTranslations("onboarding");
  const parsed = planRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const { data, error } = await hr.supabase
    .from("onboarding_plans")
    .delete()
    .eq("id", parsed.data.planId)
    .eq("org_id", parsed.data.orgId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { status: "error", message: t("errors.generic") };
  await recordAuditEvent({
    orgId: parsed.data.orgId,
    actorId: hr.user.id,
    action: "onboarding.plan_deleted",
    entityType: "onboarding",
    entityId: parsed.data.planId,
  });
  revalidatePath(onboardingPath(hr.org.slug), "layout");
  redirect(onboardingPath(hr.org.slug));
}

/** Asigna el plan a una persona que se incorpora (con o sin cuenta). */
export async function assignOnboardingPlanAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("onboarding");
  const parsed = assignSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError(formData, { fieldErrors: zodFieldErrors(parsed.error) });
  const input = parsed.data;
  const hr = await requireHrContext(input.orgId);
  if (!hr) return formError(formData, { message: t("errors.forbidden") });

  const { data: assignmentId, error } = await hr.supabase.rpc("assign_onboarding_plan", {
    p_plan_id: input.planId,
    p_employee_name: input.employeeName,
    p_start_date: input.startDate,
    p_employee_email: input.employeeEmail,
    p_member_user_id: input.memberUserId,
  });
  if (error || !assignmentId) return formError(formData, { message: t("errors.assign") });

  // Sin nombre ni email en la auditoría: solo identificadores.
  await recordAuditEvent({
    orgId: input.orgId,
    actorId: hr.user.id,
    action: "onboarding.assigned",
    entityType: "onboarding",
    entityId: assignmentId,
    details: { plan_id: input.planId, with_account: Boolean(input.memberUserId) },
  });
  revalidatePath(onboardingPath(hr.org.slug), "layout");
  redirect(onboardingPath(hr.org.slug, `/assignments/${assignmentId}`));
}

export async function setOnboardingTaskDoneAction(input: {
  orgId: string;
  taskId: string;
  done: boolean;
}): Promise<FormState> {
  const t = await getTranslations("onboarding");
  const parsed = taskDoneSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  // La fecha y la persona las fija un trigger de la base de datos.
  const { data, error } = await hr.supabase
    .from("onboarding_assignment_tasks")
    .update({ completed_at: parsed.data.done ? new Date().toISOString() : null })
    .eq("id", parsed.data.taskId)
    .eq("org_id", parsed.data.orgId)
    .select("assignment_id")
    .maybeSingle();
  if (error || !data) return { status: "error", message: t("errors.generic") };

  await recordAuditEvent({
    orgId: parsed.data.orgId,
    actorId: hr.user.id,
    action: parsed.data.done ? "onboarding.task_completed" : "onboarding.task_reopened",
    entityType: "onboarding",
    entityId: data.assignment_id,
    details: { task_id: parsed.data.taskId },
  });
  revalidatePath(onboardingPath(hr.org.slug), "layout");
  return { status: "success" };
}

export async function deleteOnboardingAssignmentAction(input: {
  orgId: string;
  assignmentId: string;
}): Promise<FormState> {
  const t = await getTranslations("onboarding");
  const parsed = assignmentRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const { data, error } = await hr.supabase
    .from("onboarding_assignments")
    .delete()
    .eq("id", parsed.data.assignmentId)
    .eq("org_id", parsed.data.orgId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { status: "error", message: t("errors.generic") };
  await recordAuditEvent({
    orgId: parsed.data.orgId,
    actorId: hr.user.id,
    action: "onboarding.assignment_deleted",
    entityType: "onboarding",
    entityId: parsed.data.assignmentId,
  });
  revalidatePath(onboardingPath(hr.org.slug), "layout");
  redirect(onboardingPath(hr.org.slug));
}

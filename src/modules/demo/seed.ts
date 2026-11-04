import "server-only";
import { randomUUID } from "node:crypto";
import { createMockRuntime, runWithAiRuntime } from "@/lib/ai/runtime";
import type { HrContext } from "@/lib/auth/hr-context";
import type { FormState } from "@/lib/forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCandidateAction, setCandidateStatusAction } from "@/modules/candidates/actions";
import { processKbDocument } from "@/modules/faq/ingest";
import { generateInterviewGuideAction } from "@/modules/interviews/actions";
import { generateJobContentAction, setJobStatusAction } from "@/modules/jobs/actions";
import {
  generateOnboardingPlanAction,
  setOnboardingTaskDoneAction,
} from "@/modules/onboarding/actions";
import { todayIn } from "@/modules/onboarding/plan";
import {
  createTrainingAction,
  generateModuleAction,
  generateOutlineAction,
  generateQuizAction,
  publishTrainingAction,
} from "@/modules/trainings/actions";
import type { DemoContent } from "./content";
import { textPdf } from "./pdf";

const PDF_MIME = "application/pdf";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

function ok<T>(result: FormState<T>, step: string): Extract<FormState<T>, { status: "success" }> {
  if (result.status !== "success") {
    const message = result.status === "error" && result.message ? `: ${result.message}` : "";
    throw new Error(`Demo (${step})${message}`);
  }
  return result;
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Rellena una empresa demo recién creada con datos ficticios, usando los mismos
 * procesos que la app y la IA en modo mock (sin coste). Los documentos de la FAQ
 * usan el proveedor de embeddings configurado para que la búsqueda funcione.
 */
export async function seedDemoOrganization(hr: HrContext, content: DemoContent): Promise<void> {
  const orgId = hr.org.id;
  const today = todayIn("UTC");

  await runWithAiRuntime(createMockRuntime(), async () => {
    // 1. Puestos: uno abierto con sus textos generados y otro en borrador.
    const saveJob = async (job: DemoContent["openJob"]) => {
      const { data, error } = await hr.supabase.rpc("save_job_position", {
        p_org_id: orgId,
        p_fields: job.fields,
        p_requirements: job.requirements.map((req) => ({ id: "", text: req.text, kind: req.kind })),
      });
      if (error || !data) throw new Error(`Demo (puesto): ${error?.message}`);
      return data;
    };
    const openJobId = await saveJob(content.openJob);
    await saveJob(content.draftJob);
    ok(await generateJobContentAction(form({ orgId, jobId: openJobId })), "textos del puesto");
    ok(await setJobStatusAction(form({ orgId, jobId: openJobId, status: "open" })), "abrir puesto");

    // 2. Candidaturas: CVs ficticios analizados con el mismo proceso que la app.
    const files = content.cvs.map((cv) => ({ ...cv, bytes: textPdf([cv.lines]) }));
    const { data: registered, error: registerError } = await hr.supabase.rpc(
      "register_candidates",
      {
        p_job_id: openJobId,
        p_files: files.map((file) => ({
          filename: file.filename,
          mime: PDF_MIME,
          size: file.bytes.byteLength,
        })),
      },
    );
    if (registerError || !registered?.length) {
      throw new Error(`Demo (candidaturas): ${registerError?.message}`);
    }
    // El fichero del CV lo sube el servidor (como con la URL firmada de la app).
    const admin = createAdminClient();
    for (const [index, row] of registered.entries()) {
      const { error } = await admin.storage
        .from("cvs")
        .upload(row.cv_path, files[index]!.bytes, { contentType: PDF_MIME });
      if (error) throw new Error(`Demo (subida de CV): ${error.message}`);
      ok(await processCandidateAction({ orgId, candidateId: row.candidate_id }), "análisis de CV");
    }
    const firstCandidate = registered[0]!.candidate_id;
    ok(
      await setCandidateStatusAction({
        orgId,
        candidateId: firstCandidate,
        status: "advance",
        comment: content.decisionComment,
      }),
      "decisión",
    );

    // 3. Guías de entrevista: del puesto y adaptada a la candidatura que avanza.
    ok(await generateInterviewGuideAction({ orgId, jobId: openJobId }), "guía del puesto");
    ok(
      await generateInterviewGuideAction({ orgId, jobId: openJobId, candidateId: firstCandidate }),
      "guía de la candidatura",
    );

    // 4. Onboarding: plan del puesto asignado a una incorporación ficticia en curso.
    const plan = ok(await generateOnboardingPlanAction({ orgId, jobId: openJobId }), "plan");
    const { data: assignmentId, error: assignError } = await hr.supabase.rpc(
      "assign_onboarding_plan",
      {
        p_plan_id: plan.data!.planId,
        p_employee_name: content.newHireName,
        p_start_date: shiftDate(today, -7),
      },
    );
    if (assignError || !assignmentId) throw new Error(`Demo (onboarding): ${assignError?.message}`);
    const { data: tasks } = await hr.supabase
      .from("onboarding_assignment_tasks")
      .select("id")
      .eq("assignment_id", assignmentId)
      .order("due_date", { ascending: true })
      .limit(3);
    for (const task of tasks ?? []) {
      ok(await setOnboardingTaskDoneAction({ orgId, taskId: task.id, done: true }), "tarea");
    }
  });

  // 5. FAQ: la política ficticia, procesada con el proveedor de embeddings real.
  const documentId = randomUUID();
  const policyBytes = textPdf(content.policy.pages);
  const policyPath = `${orgId}/${documentId}.pdf`;
  const { error: docError } = await hr.supabase.from("kb_documents").insert({
    id: documentId,
    org_id: orgId,
    title: content.policy.title,
    doc_type: "policy",
    file_path: policyPath,
    file_mime: PDF_MIME,
    file_size: policyBytes.byteLength,
  });
  if (docError) throw new Error(`Demo (documento): ${docError.message}`);
  const { error: uploadError } = await hr.supabase.storage
    .from("kb-documents")
    .upload(policyPath, policyBytes, { contentType: PDF_MIME });
  if (uploadError) throw new Error(`Demo (subida del documento): ${uploadError.message}`);
  const processed = await processKbDocument(hr, documentId);
  const documentReady = Boolean(processed?.ok);

  // 6. Formación generada a partir de la política, publicada y asignada a quien prueba.
  await runWithAiRuntime(createMockRuntime(), async () => {
    const created = ok(
      await createTrainingAction({
        orgId,
        topic: content.training.topic,
        audience: content.training.audience,
        moduleCount: 3,
        questionCount: 5,
        kbDocumentIds: documentReady ? [documentId] : [],
        files: [],
      }),
      "formación",
    );
    const trainingId = created.data!.trainingId;
    const outline = ok(
      await generateOutlineAction({ orgId, trainingId, moduleCount: 3, keepTitle: false }),
      "índice",
    );
    for (const item of outline.data!.modules) {
      ok(await generateModuleAction({ orgId, trainingId, moduleId: item.id }), "módulo");
    }
    ok(await generateQuizAction({ orgId, trainingId, questionCount: 5 }), "test");
    ok(await publishTrainingAction({ orgId, trainingId }), "publicar");
    const { error } = await hr.supabase.rpc("assign_training", {
      p_training_id: trainingId,
      p_user_ids: [hr.user.id],
      p_due_date: shiftDate(today, 14),
    });
    if (error) throw new Error(`Demo (asignación): ${error.message}`);
  });
}

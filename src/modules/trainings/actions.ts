"use server";

/**
 * Acciones de formación. RRHH crea (con IA, por pasos), edita, publica,
 * duplica, asigna y sigue el progreso; la plantilla completa módulos y entrega
 * intentos del test. Todo con la sesión de la persona (RLS); la nota la calcula
 * la base de datos y las respuestas correctas nunca salen hacia la plantilla
 * antes de un intento.
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { recordAuditEvent } from "@/lib/audit";
import { type HrContext, requireHrContext, requireMemberContext } from "@/lib/auth/hr-context";
import { isSupportedMime, mimeFromFilename } from "@/lib/extraction";
import { type FormState, formDataToObject, formError, zodFieldErrors } from "@/lib/forms";
import { orgPath } from "@/lib/navigation";
import type { Json } from "@/lib/supabase/database.types";
import { MAX_STORED_SOURCE_CHARS, TRAINING_BUCKET } from "./constants";
import {
  type StepResult,
  generateModuleContent,
  generateOutline,
  generateQuiz,
} from "./generation";
import {
  type CreateTrainingInput,
  type ModuleRef,
  type QuizInput,
  type TrainingRef,
  assignSchema,
  assignmentRefSchema,
  attemptSchema,
  completeModuleSchema,
  createTrainingSchema,
  moduleRefSchema,
  moduleSchema,
  quizSchema,
  trainingInfoSchema,
  trainingRefSchema,
} from "./schemas";
import { defaultTrainingTitle } from "./sources";

function revalidateTrainings(slug: string, trainingId?: string) {
  revalidatePath(orgPath(slug, "/trainings"), "layout");
  if (trainingId) revalidatePath(orgPath(slug, `/trainings/${trainingId}`));
  revalidatePath(orgPath(slug, "/my-trainings"), "layout");
}

async function stepMessage(result: Exclude<StepResult<unknown>, { ok: true }>): Promise<string> {
  const t = await getTranslations("trainings");
  if (result.reason === "ai") return result.message;
  if (result.reason === "source") {
    const key = `sourceErrors.${result.code}`;
    return t.has(key) ? t(key as "sourceErrors.unreadable") : t("sourceErrors.unreadable");
  }
  return t(`errors.${result.code}`);
}

// ---------------------------------------------------------------------------
// Crear y generar (por pasos desde el navegador, con progreso)
// ---------------------------------------------------------------------------
export type CreatedTraining = {
  trainingId: string;
  uploads: { sourceId: string; path: string; token: string }[];
};

/**
 * Crea el borrador con sus fuentes: copia el texto de los documentos de la FAQ
 * elegidos y prepara URLs firmadas para subir los ficheros (el navegador los
 * sube directo a Storage).
 */
export async function createTrainingAction(
  input: CreateTrainingInput,
): Promise<FormState<CreatedTraining>> {
  const t = await getTranslations("trainings");
  const parsed = createTrainingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: t("errors.invalid"),
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  const data = parsed.data;
  const hr = await requireHrContext(data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };

  const files = [];
  for (const file of data.files) {
    const mime = isSupportedMime(file.type) ? file.type : mimeFromFilename(file.name);
    if (!mime) return { status: "error", message: t("errors.fileType", { name: file.name }) };
    files.push({ ...file, mime });
  }

  // Documentos de la FAQ: instantánea del texto de sus fragmentos.
  const kbSources: { kbDocumentId: string; title: string; content: string }[] = [];
  if (data.kbDocumentIds.length) {
    const [{ data: docs }, { data: chunks }] = await Promise.all([
      hr.supabase
        .from("kb_documents")
        .select("id, title")
        .eq("org_id", data.orgId)
        .eq("status", "ready")
        .in("id", data.kbDocumentIds),
      hr.supabase
        .from("kb_chunks")
        .select("document_id, chunk_index, heading, content")
        .in("document_id", data.kbDocumentIds)
        .order("chunk_index", { ascending: true }),
    ]);
    for (const doc of docs ?? []) {
      const text = (chunks ?? [])
        .filter((chunk) => chunk.document_id === doc.id)
        .map((chunk) => (chunk.heading ? `## ${chunk.heading}\n${chunk.content}` : chunk.content))
        .join("\n\n");
      kbSources.push({
        kbDocumentId: doc.id,
        title: doc.title,
        content: text.slice(0, MAX_STORED_SOURCE_CHARS),
      });
    }
    if (kbSources.length !== data.kbDocumentIds.length) {
      return { status: "error", message: t("errors.documents") };
    }
  }

  const trainingId = randomUUID();
  const { error } = await hr.supabase.from("trainings").insert({
    id: trainingId,
    org_id: data.orgId,
    title: defaultTrainingTitle(data.title, data.topic, t("untitled")),
    topic: data.topic ?? null,
    audience: data.audience ?? null,
  });
  if (error) return { status: "error", message: t("errors.generic") };

  const sourceRows = [
    ...kbSources.map((source) => ({
      org_id: data.orgId,
      training_id: trainingId,
      kind: "kb_document" as const,
      kb_document_id: source.kbDocumentId,
      title: source.title.slice(0, 200),
      content: source.content,
    })),
    ...files.map((file) => {
      const id = randomUUID();
      return {
        id,
        org_id: data.orgId,
        training_id: trainingId,
        kind: "upload" as const,
        title: file.name.replace(/\.(pdf|docx)$/i, "").slice(0, 200) || file.name.slice(0, 200),
        file_path: `${data.orgId}/${trainingId}/${id}.${file.mime === "application/pdf" ? "pdf" : "docx"}`,
        file_mime: file.mime,
      };
    }),
  ];
  if (sourceRows.length) {
    const { error: sourcesError } = await hr.supabase.from("training_sources").insert(sourceRows);
    if (sourcesError) {
      await hr.supabase.from("trainings").delete().eq("id", trainingId);
      return { status: "error", message: t("errors.generic") };
    }
  }

  const uploads: CreatedTraining["uploads"] = [];
  for (const row of sourceRows) {
    if (!("file_path" in row)) continue;
    const { data: signed, error: signError } = await hr.supabase.storage
      .from(TRAINING_BUCKET)
      .createSignedUploadUrl(row.file_path);
    if (signError || !signed) {
      await hr.supabase.from("trainings").delete().eq("id", trainingId);
      return { status: "error", message: t("errors.upload") };
    }
    uploads.push({ sourceId: row.id, path: row.file_path, token: signed.token });
  }

  await recordAuditEvent({
    orgId: data.orgId,
    actorId: hr.user.id,
    action: "training.created",
    entityType: "training",
    entityId: trainingId,
    details: {
      topic: Boolean(data.topic),
      kb_documents: kbSources.length,
      uploads: uploads.length,
    },
  });
  revalidateTrainings(hr.org.slug);
  return { status: "success", data: { trainingId, uploads } };
}

/** Paso 1: índice de la formación. */
export async function generateOutlineAction(
  input: TrainingRef & { moduleCount: number; keepTitle: boolean },
): Promise<FormState<{ modules: { id: string; title: string }[] }>> {
  const t = await getTranslations("trainings");
  const parsed = trainingRefSchema.safeParse(input);
  const moduleCount = Math.min(8, Math.max(2, Math.round(Number(input.moduleCount) || 4)));
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const result = await generateOutline(hr, parsed.data.trainingId, {
    moduleCount,
    keepTitle: Boolean(input.keepTitle),
  });
  revalidateTrainings(hr.org.slug, parsed.data.trainingId);
  if (!result.ok) return { status: "error", message: await stepMessage(result) };
  return { status: "success", data: result.data };
}

/** Paso 2: contenido de un módulo (también para regenerarlo desde el editor). */
export async function generateModuleAction(input: ModuleRef): Promise<FormState> {
  const t = await getTranslations("trainings");
  const parsed = moduleRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const result = await generateModuleContent(hr, parsed.data.trainingId, parsed.data.moduleId);
  revalidateTrainings(hr.org.slug, parsed.data.trainingId);
  if (!result.ok) return { status: "error", message: await stepMessage(result) };
  return { status: "success" };
}

/** Paso 3: test con explicaciones. */
export async function generateQuizAction(
  input: TrainingRef & { questionCount: number },
): Promise<FormState> {
  const t = await getTranslations("trainings");
  const parsed = trainingRefSchema.safeParse(input);
  const questionCount = Math.min(15, Math.max(3, Math.round(Number(input.questionCount) || 8)));
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const result = await generateQuiz(hr, parsed.data.trainingId, questionCount);
  revalidateTrainings(hr.org.slug, parsed.data.trainingId);
  if (!result.ok) return { status: "error", message: await stepMessage(result) };
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Edición
// ---------------------------------------------------------------------------
export async function updateTrainingInfoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("trainings");
  const parsed = trainingInfoSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return formError(formData, { fieldErrors: zodFieldErrors(parsed.error) });
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return formError(formData, { message: t("errors.forbidden") });
  const { error } = await hr.supabase
    .from("trainings")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      audience: parsed.data.audience || null,
    })
    .eq("id", parsed.data.trainingId)
    .eq("org_id", parsed.data.orgId);
  if (error) return formError(formData, { message: t("errors.generic") });
  revalidateTrainings(hr.org.slug, parsed.data.trainingId);
  return { status: "success", message: t("saved") };
}

/** Guarda un módulo (los ejemplos llegan como JSON en un campo oculto). */
export async function saveModuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("trainings");
  const raw = formDataToObject(formData);
  let examples: unknown = [];
  try {
    examples = JSON.parse(raw.examples ?? "[]");
  } catch {
    examples = null;
  }
  const parsed = moduleSchema.safeParse({ ...raw, examples });
  if (!parsed.success) return formError(formData, { fieldErrors: zodFieldErrors(parsed.error) });
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return formError(formData, { message: t("errors.forbidden") });
  const { error } = await hr.supabase
    .from("training_modules")
    .update({
      title: parsed.data.title,
      objective: parsed.data.objective,
      content: parsed.data.content,
      summary: parsed.data.summary,
      examples: parsed.data.examples as unknown as Json,
    })
    .eq("id", parsed.data.moduleId)
    .eq("training_id", parsed.data.trainingId);
  if (error) return formError(formData, { message: t("errors.generic") });
  revalidateTrainings(hr.org.slug, parsed.data.trainingId);
  return { status: "success", message: t("moduleSaved") };
}

export async function addModuleAction(input: TrainingRef): Promise<FormState<{ id: string }>> {
  const t = await getTranslations("trainings");
  const parsed = trainingRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const { data: last } = await hr.supabase
    .from("training_modules")
    .select("position")
    .eq("training_id", parsed.data.trainingId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await hr.supabase
    .from("training_modules")
    .insert({
      org_id: parsed.data.orgId,
      training_id: parsed.data.trainingId,
      position: (last?.position ?? 0) + 1,
      title: t("newModuleTitle"),
    })
    .select("id")
    .single();
  if (error || !data) return { status: "error", message: t("errors.generic") };
  revalidateTrainings(hr.org.slug, parsed.data.trainingId);
  return { status: "success", data: { id: data.id } };
}

export async function deleteModuleAction(input: ModuleRef): Promise<FormState> {
  const t = await getTranslations("trainings");
  const parsed = moduleRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const { error } = await hr.supabase
    .from("training_modules")
    .delete()
    .eq("id", parsed.data.moduleId)
    .eq("training_id", parsed.data.trainingId);
  if (error) return { status: "error", message: t("errors.generic") };
  revalidateTrainings(hr.org.slug, parsed.data.trainingId);
  return { status: "success" };
}

/** Sustituye el test (solo si aún no tiene intentos: lo comprueba la base de datos). */
export async function saveQuizAction(input: QuizInput): Promise<FormState> {
  const t = await getTranslations("trainings");
  const parsed = quizSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: "error",
      message: t("errors.quizInvalid"),
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const { error } = await hr.supabase.rpc("save_training_quiz", {
    p_training_id: parsed.data.trainingId,
    p_questions: parsed.data.questions.map((question) => ({
      question: question.question,
      options: question.options,
      correct_index: question.correctIndex,
      explanation: question.explanation,
    })) as unknown as Json,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "42501" ? t("errors.locked") : t("errors.quizInvalid"),
    };
  }
  revalidateTrainings(hr.org.slug, parsed.data.trainingId);
  return { status: "success", message: t("quizSaved") };
}

export async function publishTrainingAction(input: TrainingRef): Promise<FormState> {
  const t = await getTranslations("trainings");
  const parsed = trainingRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const { error } = await hr.supabase.rpc("publish_training", {
    p_training_id: parsed.data.trainingId,
  });
  if (error) {
    return {
      status: "error",
      message: error.code === "22023" ? t("errors.incomplete") : t("errors.generic"),
    };
  }
  revalidateTrainings(hr.org.slug, parsed.data.trainingId);
  return { status: "success", message: t("published") };
}

export async function duplicateTrainingAction(
  input: TrainingRef,
): Promise<FormState<{ id: string }>> {
  const t = await getTranslations("trainings");
  const parsed = trainingRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const { data: training } = await hr.supabase
    .from("trainings")
    .select("title")
    .eq("id", parsed.data.trainingId)
    .maybeSingle();
  if (!training) return { status: "error", message: t("errors.not_found") };
  const { data: copyId, error } = await hr.supabase.rpc("duplicate_training", {
    p_training_id: parsed.data.trainingId,
    p_title: t("copyTitle", { title: training.title }).slice(0, 200),
  });
  if (error || !copyId) return { status: "error", message: t("errors.generic") };
  revalidateTrainings(hr.org.slug);
  return { status: "success", data: { id: copyId } };
}

async function removeUploadedSources(hr: HrContext, trainingId: string) {
  const { data: sources } = await hr.supabase
    .from("training_sources")
    .select("file_path")
    .eq("training_id", trainingId)
    .not("file_path", "is", null);
  const paths = (sources ?? []).map((source) => source.file_path).filter(Boolean) as string[];
  if (paths.length) await hr.supabase.storage.from(TRAINING_BUCKET).remove(paths);
}

/** Borra una formación sin intentos (con intentos, la base de datos lo impide). */
export async function deleteTrainingAction(input: TrainingRef): Promise<FormState> {
  const t = await getTranslations("trainings");
  const parsed = trainingRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const { count } = await hr.supabase
    .from("training_attempts")
    .select("id", { count: "exact", head: true })
    .eq("training_id", parsed.data.trainingId);
  if ((count ?? 0) > 0) return { status: "error", message: t("errors.hasAttempts") };

  await removeUploadedSources(hr, parsed.data.trainingId);
  const { error } = await hr.supabase
    .from("trainings")
    .delete()
    .eq("id", parsed.data.trainingId)
    .eq("org_id", parsed.data.orgId);
  if (error) return { status: "error", message: t("errors.hasAttempts") };
  await recordAuditEvent({
    orgId: parsed.data.orgId,
    actorId: hr.user.id,
    action: "training.deleted",
    entityType: "training",
    entityId: parsed.data.trainingId,
  });
  revalidateTrainings(hr.org.slug);
  return { status: "success", message: t("deleted") };
}

// ---------------------------------------------------------------------------
// Asignaciones
// ---------------------------------------------------------------------------
export async function assignTrainingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("trainings");
  const parsed = assignSchema.safeParse({
    ...formDataToObject(formData),
    userIds: formData.getAll("userIds").filter((value) => typeof value === "string"),
  });
  if (!parsed.success) return formError(formData, { fieldErrors: zodFieldErrors(parsed.error) });
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return formError(formData, { message: t("errors.forbidden") });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "UTC" });
  if (parsed.data.dueDate && parsed.data.dueDate < today) {
    return formError(formData, { fieldErrors: { dueDate: ["dueDatePast"] } });
  }
  const { data: training } = await hr.supabase
    .from("trainings")
    .select("status")
    .eq("id", parsed.data.trainingId)
    .eq("org_id", parsed.data.orgId)
    .maybeSingle();
  if (!training) return formError(formData, { message: t("errors.not_found") });
  if (training.status !== "published") {
    return formError(formData, { message: t("errors.notPublished") });
  }
  const { data, error } = await hr.supabase.rpc("assign_training", {
    p_training_id: parsed.data.trainingId,
    p_user_ids: parsed.data.userIds,
    ...(parsed.data.dueDate ? { p_due_date: parsed.data.dueDate } : {}),
  });
  if (error) return formError(formData, { message: t("errors.assign") });
  revalidateTrainings(hr.org.slug, parsed.data.trainingId);
  return { status: "success", message: t("assign.done", { count: data ?? 0 }) };
}

export async function removeAssignmentAction(input: {
  orgId: string;
  assignmentId: string;
  trainingId: string;
}): Promise<FormState> {
  const t = await getTranslations("trainings");
  const parsed = assignmentRefSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const hr = await requireHrContext(parsed.data.orgId);
  if (!hr) return { status: "error", message: t("errors.forbidden") };
  const { data, error } = await hr.supabase
    .from("training_assignments")
    .delete()
    .eq("id", parsed.data.assignmentId)
    .select("id");
  if (error || !data?.length) return { status: "error", message: t("errors.hasAttempts") };
  revalidateTrainings(hr.org.slug, input.trainingId);
  return { status: "success" };
}

// ---------------------------------------------------------------------------
// Plantilla: módulos completados e intentos
// ---------------------------------------------------------------------------
export async function completeModuleAction(input: {
  orgId: string;
  assignmentId: string;
  moduleId: string;
}): Promise<FormState> {
  const t = await getTranslations("myTrainings");
  const parsed = completeModuleSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.generic") };
  const member = await requireMemberContext(parsed.data.orgId);
  if (!member) return { status: "error", message: t("errors.generic") };
  const { error } = await member.supabase.from("training_module_progress").upsert(
    {
      assignment_id: parsed.data.assignmentId,
      module_id: parsed.data.moduleId,
      org_id: parsed.data.orgId,
    },
    { onConflict: "assignment_id,module_id", ignoreDuplicates: true },
  );
  if (error) return { status: "error", message: t("errors.generic") };
  revalidatePath(orgPath(member.org.slug, `/my-trainings/${parsed.data.assignmentId}`));
  revalidatePath(orgPath(member.org.slug, "/my-trainings"));
  return { status: "success" };
}

export type AttemptResult = {
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  bestScore: number;
  passScore: number;
  results: {
    questionId: string;
    selected: number;
    correctIndex: number;
    correct: boolean;
    explanation: string;
  }[];
};

/** Entrega un intento: la nota la calcula la base de datos. */
export async function submitAttemptAction(input: {
  orgId: string;
  assignmentId: string;
  answers: number[];
}): Promise<FormState<AttemptResult>> {
  const t = await getTranslations("myTrainings");
  const parsed = attemptSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: t("errors.answerAll") };
  const member = await requireMemberContext(parsed.data.orgId);
  if (!member) return { status: "error", message: t("errors.generic") };
  const { data, error } = await member.supabase.rpc("submit_training_attempt", {
    p_assignment_id: parsed.data.assignmentId,
    p_answers: parsed.data.answers,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return {
      status: "error",
      message: error?.code === "22023" ? t("errors.answerAll") : t("errors.generic"),
    };
  }
  const raw = data as Record<string, unknown>;
  const results = Array.isArray(raw.results) ? (raw.results as Record<string, unknown>[]) : [];
  revalidatePath(orgPath(member.org.slug, `/my-trainings/${parsed.data.assignmentId}`));
  revalidatePath(orgPath(member.org.slug, "/my-trainings"));
  revalidatePath(orgPath(member.org.slug, "/trainings"), "layout");
  return {
    status: "success",
    data: {
      score: Number(raw.score),
      passed: Boolean(raw.passed),
      correct: Number(raw.correct),
      total: Number(raw.total),
      bestScore: Number(raw.best_score),
      passScore: Number(raw.pass_score),
      results: results.map((item) => ({
        questionId: String(item.question_id),
        selected: Number(item.selected),
        correctIndex: Number(item.correct_index),
        correct: Boolean(item.correct),
        explanation: String(item.explanation ?? ""),
      })),
    },
  };
}

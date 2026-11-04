import "server-only";
import { createClient } from "@/lib/supabase/server";
import { TRAINING_PASS_SCORE } from "./constants";

export type TrainingExample = { title: string; description: string };

function toExamples(value: unknown): TrainingExample[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is TrainingExample =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as TrainingExample).title === "string" &&
        typeof (item as TrainingExample).description === "string",
    )
    .map((item) => ({ title: item.title, description: item.description }));
}

const countOf = (value: unknown): number =>
  Array.isArray(value) && typeof value[0]?.count === "number" ? value[0].count : 0;

async function profileNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  for (const profile of data ?? []) {
    names.set(profile.id, profile.full_name ?? profile.email ?? "");
  }
  return names;
}

/** Formaciones de la empresa con sus cifras (para RRHH). */
export async function listTrainings(orgId: string) {
  const supabase = await createClient();
  const [{ data: trainings }, { data: assignments }] = await Promise.all([
    supabase
      .from("trainings")
      .select(
        "id, title, description, status, published_at, created_at, updated_at, training_modules(count), training_quiz_questions(count)",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("training_assignments")
      .select("training_id, best_score, passed_at")
      .eq("org_id", orgId),
  ]);
  return (trainings ?? []).map((training) => {
    const mine = (assignments ?? []).filter((item) => item.training_id === training.id);
    const scores = mine
      .map((item) => item.best_score)
      .filter((score): score is number => score !== null)
      .map(Number);
    return {
      id: training.id,
      title: training.title,
      description: training.description,
      status: training.status,
      publishedAt: training.published_at,
      createdAt: training.created_at,
      modules: countOf(training.training_modules),
      questions: countOf(training.training_quiz_questions),
      assigned: mine.length,
      passed: mine.filter((item) => item.passed_at).length,
      averageBest: scores.length
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : null,
    };
  });
}

export type TrainingSummary = Awaited<ReturnType<typeof listTrainings>>[number];

/** Formación completa para editarla (RRHH): módulos, test con respuestas y asignaciones. */
export async function getTrainingForHr(orgId: string, trainingId: string) {
  const supabase = await createClient();
  const { data: training } = await supabase
    .from("trainings")
    .select(
      "id, org_id, title, description, topic, audience, status, published_at, duplicated_from, generation, created_at, updated_at",
    )
    .eq("id", trainingId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!training) return null;

  const [{ data: modules }, { data: questions }, { data: sources }, { data: assignments }] =
    await Promise.all([
      supabase
        .from("training_modules")
        .select("id, position, title, objective, content, examples, summary")
        .eq("training_id", trainingId)
        .order("position", { ascending: true }),
      supabase
        .from("training_quiz_questions")
        .select("id, position, question, options, training_quiz_keys(correct_index, explanation)")
        .eq("training_id", trainingId)
        .order("position", { ascending: true }),
      supabase
        .from("training_sources")
        .select("id, kind, title")
        .eq("training_id", trainingId)
        .order("created_at", { ascending: true }),
      supabase
        .from("training_assignments")
        .select(
          "id, user_id, due_date, best_score, attempt_count, passed_at, created_at, training_module_progress(count)",
        )
        .eq("training_id", trainingId)
        .order("created_at", { ascending: true }),
    ]);

  const names = await profileNames((assignments ?? []).map((item) => item.user_id));
  const moduleCount = modules?.length ?? 0;

  return {
    ...training,
    modules: (modules ?? []).map((module) => ({
      ...module,
      examples: toExamples(module.examples),
    })),
    questions: (questions ?? []).map((question) => {
      const key = Array.isArray(question.training_quiz_keys)
        ? question.training_quiz_keys[0]
        : question.training_quiz_keys;
      return {
        id: question.id,
        position: question.position,
        question: question.question,
        options: question.options,
        correctIndex: key?.correct_index ?? null,
        explanation: key?.explanation ?? "",
      };
    }),
    sources: sources ?? [],
    assignments: (assignments ?? []).map((assignment) => ({
      id: assignment.id,
      userId: assignment.user_id,
      name: names.get(assignment.user_id) ?? "",
      dueDate: assignment.due_date,
      bestScore: assignment.best_score === null ? null : Number(assignment.best_score),
      attempts: assignment.attempt_count,
      passedAt: assignment.passed_at,
      modulesDone: countOf(assignment.training_module_progress),
      moduleCount,
    })),
    hasAttempts: (assignments ?? []).some((assignment) => assignment.attempt_count > 0),
  };
}

export type TrainingDetail = NonNullable<Awaited<ReturnType<typeof getTrainingForHr>>>;

/** Documentos de la FAQ listos (para generar una formación a partir de ellos). */
export async function listReadyKbDocuments(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("kb_documents")
    .select("id, title, doc_type")
    .eq("org_id", orgId)
    .eq("status", "ready")
    .order("title", { ascending: true });
  return data ?? [];
}

/** Progreso por persona: asignadas, aprobadas y vencidas (para RRHH). */
export async function getProgressByPerson(orgId: string, today: string) {
  const supabase = await createClient();
  const [{ data: members }, { data: assignments }] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, profiles (full_name, email)")
      .eq("org_id", orgId)
      .eq("status", "active"),
    supabase
      .from("training_assignments")
      .select("user_id, due_date, best_score, passed_at")
      .eq("org_id", orgId),
  ]);
  return (members ?? [])
    .map((member) => {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
      const mine = (assignments ?? []).filter((item) => item.user_id === member.user_id);
      return {
        userId: member.user_id,
        name: profile?.full_name ?? profile?.email ?? "",
        role: member.role,
        assigned: mine.length,
        passed: mine.filter((item) => item.passed_at).length,
        overdue: mine.filter((item) => !item.passed_at && item.due_date && item.due_date < today)
          .length,
      };
    })
    .filter((row) => row.name)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Formaciones asignadas a la persona (solo las publicadas: lo aplica la RLS). */
export async function listMyAssignments(orgId: string, userId: string) {
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from("training_assignments")
    .select(
      "id, training_id, due_date, best_score, attempt_count, passed_at, created_at, trainings(id, title, description), training_module_progress(count)",
    )
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  const visible = (assignments ?? []).filter((item) => item.trainings);
  const trainingIds = visible.map((item) => item.training_id);
  const { data: modules } = trainingIds.length
    ? await supabase.from("training_modules").select("training_id").in("training_id", trainingIds)
    : { data: [] as { training_id: string }[] };

  return visible.map((item) => {
    const training = Array.isArray(item.trainings) ? item.trainings[0]! : item.trainings!;
    return {
      id: item.id,
      trainingId: item.training_id,
      title: training.title,
      description: training.description,
      dueDate: item.due_date,
      bestScore: item.best_score === null ? null : Number(item.best_score),
      attempts: item.attempt_count,
      passed: Boolean(item.passed_at),
      modulesDone: countOf(item.training_module_progress),
      moduleCount: (modules ?? []).filter((module) => module.training_id === item.training_id)
        .length,
    };
  });
}

/** Una formación asignada, para hacerla: módulos, preguntas (sin respuestas) e intentos. */
export async function getMyAssignment(orgId: string, assignmentId: string, userId: string) {
  const supabase = await createClient();
  const { data: assignment } = await supabase
    .from("training_assignments")
    .select("id, training_id, due_date, best_score, attempt_count, passed_at")
    .eq("id", assignmentId)
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!assignment) return null;

  const [
    { data: training },
    { data: modules },
    { data: questions },
    { data: progress },
    { data: attempts },
  ] = await Promise.all([
    supabase
      .from("trainings")
      .select("id, title, description")
      .eq("id", assignment.training_id)
      .maybeSingle(),
    supabase
      .from("training_modules")
      .select("id, position, title, objective, content, examples, summary")
      .eq("training_id", assignment.training_id)
      .order("position", { ascending: true }),
    supabase
      .from("training_quiz_questions")
      .select("id, position, question, options")
      .eq("training_id", assignment.training_id)
      .order("position", { ascending: true }),
    supabase
      .from("training_module_progress")
      .select("module_id, completed_at")
      .eq("assignment_id", assignmentId),
    supabase
      .from("training_attempts")
      .select("id, score, passed, correct_count, total, created_at")
      .eq("assignment_id", assignmentId)
      .order("created_at", { ascending: false }),
  ]);
  if (!training) return null;

  return {
    id: assignment.id,
    dueDate: assignment.due_date,
    bestScore: assignment.best_score === null ? null : Number(assignment.best_score),
    attempts: assignment.attempt_count,
    passed: Boolean(assignment.passed_at),
    passScore: TRAINING_PASS_SCORE,
    training,
    modules: (modules ?? []).map((module) => ({
      ...module,
      examples: toExamples(module.examples),
    })),
    questions: questions ?? [],
    completedModules: (progress ?? []).map((item) => item.module_id),
    attemptHistory: (attempts ?? []).map((attempt) => ({
      ...attempt,
      score: Number(attempt.score),
    })),
  };
}

export type MyAssignment = NonNullable<Awaited<ReturnType<typeof getMyAssignment>>>;

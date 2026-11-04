/**
 * Lógica pura de los planes de onboarding: fases, fechas y progreso.
 */
import type { OnboardingPlanOutput } from "@/lib/ai/prompts/onboarding/plan.v1";
import { Constants } from "@/lib/supabase/database.types";

export const ONBOARDING_PHASES = Constants.public.Enums.onboarding_phase;
export type OnboardingPhase = (typeof ONBOARDING_PHASES)[number];

/** Días del plan que abarca cada fase. */
export const PHASE_RANGES: Record<OnboardingPhase, readonly [number, number]> = {
  d30: [1, 30],
  d60: [31, 60],
  d90: [61, 90],
};

export const MAX_PLAN_TASKS = 60;

/** Tarea tal como la guarda save_onboarding_plan. */
export type PlanTaskInput = {
  phase: OnboardingPhase;
  title: string;
  description: string;
  owner_label: string;
  materials: string;
  is_checkpoint: boolean;
  due_day: number;
};

export function phaseOfDay(day: number): OnboardingPhase {
  if (day <= 30) return "d30";
  if (day <= 60) return "d60";
  return "d90";
}

/** Día dentro del rango de su fase (la IA puede equivocarse). */
export function clampDay(phase: OnboardingPhase, day: number): number {
  const [min, max] = PHASE_RANGES[phase];
  return Math.min(max, Math.max(min, Math.round(day)));
}

/** Tareas generadas por la IA → tareas del plan, ordenadas por fase y día. */
export function tasksFromAi(tasks: OnboardingPlanOutput["tasks"]): PlanTaskInput[] {
  return tasks
    .map((task, index) => ({
      index,
      task: {
        phase: task.phase,
        title: task.title.trim(),
        description: task.description.trim(),
        owner_label: task.owner.trim(),
        materials: task.materials.trim(),
        is_checkpoint: task.isCheckpoint,
        due_day: clampDay(task.phase, task.dueDay),
      },
    }))
    .sort((a, b) => a.task.due_day - b.task.due_day || a.index - b.index)
    .slice(0, MAX_PLAN_TASKS)
    .map(({ task }) => task);
}

/** Fecha de vencimiento: el día 1 es el de incorporación (como en assign_onboarding_plan). */
export function dueDate(startDate: string, dueDay: number): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dueDay - 1);
  return date.toISOString().slice(0, 10);
}

export type Progress = { done: number; total: number; percent: number };

export function progressOf(tasks: readonly { completed_at: string | null }[]): Progress {
  const done = tasks.filter((task) => task.completed_at).length;
  return {
    done,
    total: tasks.length,
    percent: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

/** Tareas vencidas y sin completar a fecha `today` (AAAA-MM-DD). */
export function isOverdue(task: { due_date: string; completed_at: string | null }, today: string) {
  return !task.completed_at && task.due_date < today;
}

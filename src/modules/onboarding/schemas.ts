import { z } from "zod";
import { MAX_PLAN_TASKS, ONBOARDING_PHASES, PHASE_RANGES } from "./plan";

// Los mensajes son claves de messages/es.json → "validation".

export const planTaskSchema = z
  .object({
    phase: z.enum(ONBOARDING_PHASES, { error: "required" }),
    title: z.string().trim().min(2, { error: "taskTitle" }).max(200, { error: "taskTitle" }),
    description: z.string().trim().max(1000, { error: "tooLong" }).default(""),
    owner_label: z.string().trim().max(100, { error: "tooLong" }).default(""),
    materials: z.string().trim().max(500, { error: "tooLong" }).default(""),
    is_checkpoint: z.boolean().default(false),
    due_day: z.coerce
      .number({ error: "dueDay" })
      .int({ error: "dueDay" })
      .min(1, { error: "dueDay" })
      .max(90, { error: "dueDay" }),
  })
  .superRefine((task, ctx) => {
    const [min, max] = PHASE_RANGES[task.phase];
    if (task.due_day < min || task.due_day > max) {
      ctx.addIssue({ code: "custom", path: ["due_day"], message: "dueDayPhase" });
    }
  });

export type PlanTaskForm = z.input<typeof planTaskSchema>;

const tasksField = z
  .string()
  .transform((value, ctx) => {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      ctx.addIssue({ code: "custom", message: "invalid" });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .array(planTaskSchema)
      .min(1, { error: "planTasks" })
      .max(MAX_PLAN_TASKS, { error: "planTasks" }),
  );

export const planFormSchema = z.object({
  orgId: z.uuid(),
  planId: z.uuid(),
  title: z.string().trim().min(2, { error: "planTitle" }).max(200, { error: "planTitle" }),
  intro: z.string().trim().max(2000, { error: "tooLong" }).default(""),
  tasks: tasksField,
});

const optional = (schema: z.ZodType<string, string>) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(schema.optional());

export const assignSchema = z.object({
  orgId: z.uuid(),
  planId: z.uuid(),
  employeeName: z.string().trim().min(2, { error: "nameLength" }).max(150, { error: "nameLength" }),
  employeeEmail: optional(
    z
      .string()
      .toLowerCase()
      .max(254)
      .pipe(z.email({ error: "email" })),
  ),
  memberUserId: optional(z.uuid()),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "date" }),
});

export const planRefSchema = z.object({ orgId: z.uuid(), planId: z.uuid() });
export const assignmentRefSchema = z.object({ orgId: z.uuid(), assignmentId: z.uuid() });
export const taskDoneSchema = z.object({
  orgId: z.uuid(),
  taskId: z.uuid(),
  done: z.boolean(),
});

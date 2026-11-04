import { z } from "zod";
import {
  MAX_KB_SOURCES,
  MAX_QUESTIONS,
  MAX_UPLOAD_SOURCES,
  MODULE_COUNT,
  QUESTION_COUNT,
  TRAINING_MAX_FILE_BYTES,
} from "./constants";

// Los mensajes son claves de messages/es.json → "validation".

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "tooLong" })
    .optional()
    .transform((value) => (value ? value : undefined));

export const createTrainingSchema = z
  .object({
    orgId: z.uuid(),
    title: optionalText(200),
    topic: optionalText(2000),
    audience: optionalText(300),
    moduleCount: z.coerce.number().int().min(MODULE_COUNT.min).max(MODULE_COUNT.max),
    questionCount: z.coerce.number().int().min(QUESTION_COUNT.min).max(QUESTION_COUNT.max),
    kbDocumentIds: z.array(z.uuid()).max(MAX_KB_SOURCES).default([]),
    files: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(255),
          size: z.number().int().positive().max(TRAINING_MAX_FILE_BYTES),
          type: z.string().max(200),
        }),
      )
      .max(MAX_UPLOAD_SOURCES)
      .default([]),
  })
  .refine((input) => input.topic || input.kbDocumentIds.length > 0 || input.files.length > 0, {
    error: "trainingSource",
    path: ["topic"],
  });
export type CreateTrainingInput = z.input<typeof createTrainingSchema>;

export const trainingRefSchema = z.object({ orgId: z.uuid(), trainingId: z.uuid() });
export type TrainingRef = z.infer<typeof trainingRefSchema>;

export const moduleRefSchema = trainingRefSchema.extend({ moduleId: z.uuid() });
export type ModuleRef = z.infer<typeof moduleRefSchema>;

export const trainingInfoSchema = trainingRefSchema.extend({
  title: z.string().trim().min(2, { error: "trainingTitle" }).max(200, { error: "trainingTitle" }),
  description: z.string().trim().max(2000, { error: "tooLong" }),
  audience: z.string().trim().max(300, { error: "tooLong" }),
});

const exampleSchema = z.object({
  title: z.string().trim().min(1, { error: "required" }).max(150, { error: "tooLong" }),
  description: z.string().trim().min(1, { error: "required" }).max(800, { error: "tooLong" }),
});

export const moduleSchema = moduleRefSchema.extend({
  title: z.string().trim().min(2, { error: "moduleTitle" }).max(200, { error: "moduleTitle" }),
  objective: z.string().trim().max(600, { error: "tooLong" }),
  content: z.string().trim().max(40_000, { error: "tooLong" }),
  summary: z.string().trim().max(2000, { error: "tooLong" }),
  examples: z.array(exampleSchema).max(5, { error: "tooLong" }),
});

export const quizQuestionSchema = z
  .object({
    question: z
      .string()
      .trim()
      .min(5, { error: "quizQuestion" })
      .max(500, { error: "quizQuestion" }),
    options: z
      .array(z.string().trim().min(1, { error: "quizOption" }).max(300, { error: "quizOption" }))
      .min(2, { error: "quizOptions" })
      .max(6, { error: "quizOptions" }),
    correctIndex: z.number().int().min(0, { error: "quizCorrect" }),
    explanation: z.string().trim().max(1500, { error: "tooLong" }),
  })
  .refine((question) => question.correctIndex < question.options.length, {
    error: "quizCorrect",
    path: ["correctIndex"],
  })
  .refine(
    (question) =>
      new Set(question.options.map((option) => option.toLowerCase())).size ===
      question.options.length,
    { error: "quizOptions", path: ["options"] },
  );

export const quizSchema = trainingRefSchema.extend({
  questions: z
    .array(quizQuestionSchema)
    .min(1, { error: "quizQuestions" })
    .max(MAX_QUESTIONS, { error: "quizQuestions" }),
});
export type QuizInput = z.input<typeof quizSchema>;

export const assignSchema = trainingRefSchema.extend({
  userIds: z.array(z.uuid()).min(1, { error: "assignPeople" }).max(500),
  dueDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .pipe(z.iso.date({ error: "date" }).optional()),
});

export const assignmentRefSchema = z.object({ orgId: z.uuid(), assignmentId: z.uuid() });

export const completeModuleSchema = assignmentRefSchema.extend({ moduleId: z.uuid() });

export const attemptSchema = assignmentRefSchema.extend({
  answers: z.array(z.number().int().min(0).max(5)).min(1).max(MAX_QUESTIONS),
});

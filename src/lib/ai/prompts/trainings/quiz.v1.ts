import { z } from "zod";
import { definePrompt } from "../../types";
import { asData } from "../shared";
import { trainingSystemPrompt } from "./shared";

export const trainingQuizInputSchema = z.object({
  trainingTitle: z.string().min(2).max(200),
  modules: z
    .array(
      z.object({
        title: z.string().min(2).max(200),
        summary: z.string().max(2000),
        content: z.string().max(6000),
      }),
    )
    .min(1)
    .max(30),
  questionCount: z.number().int().min(3).max(15),
});

export type TrainingQuizInput = z.infer<typeof trainingQuizInputSchema>;

export const trainingQuizOutputSchema = z.object({
  questions: z
    .array(
      z
        .object({
          question: z.string().min(10).max(300),
          options: z.array(z.string().min(1).max(200)).min(3).max(4),
          correctIndex: z.number().int().min(0).max(3),
          explanation: z.string().min(10).max(600),
        })
        .refine((item) => item.correctIndex < item.options.length, {
          message: "correctIndex debe señalar una de las opciones",
          path: ["correctIndex"],
        })
        .refine(
          (item) =>
            new Set(item.options.map((option) => option.trim().toLowerCase())).size ===
            item.options.length,
          { message: "Las opciones deben ser distintas", path: ["options"] },
        ),
    )
    .min(3)
    .max(15),
});

export type TrainingQuizOutput = z.infer<typeof trainingQuizOutputSchema>;

const DISTRACTORS = [
  "No se trata en esta formación.",
  "Depende solo de cada persona, sin normas comunes.",
  "Solo se aplica a la dirección de la empresa.",
];

/** Paso 3: test de opción múltiple con explicación de cada respuesta. */
export const trainingQuizV1 = definePrompt({
  id: "training.quiz",
  version: 1,
  feature: "trainings",
  description: "Test de opción múltiple sobre los módulos, con explicaciones",
  effort: "medium",
  maxOutputTokens: 6000,
  input: trainingQuizInputSchema,
  output: trainingQuizOutputSchema,
  system: (ctx) =>
    trainingSystemPrompt(ctx, [
      "Tarea: crea el test final de la formación.",
      "- Exactamente el número de preguntas pedido, repartidas entre los módulos y solo sobre lo que se explica en ellos.",
      "- Cada pregunta: 3 o 4 opciones distintas, una sola correcta (correctIndex, empezando en 0) y distractores plausibles. Varía la posición de la respuesta correcta.",
      "- explanation: por qué la respuesta correcta lo es, en 1-3 frases.",
      "- Nada de preguntas trampa, de memoria literal sin sentido ni sobre datos personales.",
    ]),
  user: (input) =>
    [
      `Formación: ${input.trainingTitle}`,
      `Número de preguntas: ${input.questionCount}`,
      asData(
        "modulos",
        input.modules
          .map(
            (module, index) =>
              `### Módulo ${index + 1}: ${module.title}\nResumen: ${module.summary}\n${module.content}`,
          )
          .join("\n\n"),
      ),
    ].join("\n\n"),
  mock: (input) => ({
    questions: Array.from({ length: input.questionCount }, (_, index) => {
      const source = input.modules[index % input.modules.length]!;
      const correct =
        (source.summary.split(/(?<=[.!?:])\s+/)[0] ?? source.title).slice(0, 180) ||
        source.title.slice(0, 180);
      const correctIndex = index % 4;
      const options = [...DISTRACTORS];
      options.splice(correctIndex, 0, correct);
      return {
        question: `Pregunta ${index + 1}: ¿qué idea resume el módulo «${source.title}»?`.slice(
          0,
          300,
        ),
        options: options.slice(0, 4),
        correctIndex,
        explanation: `El módulo «${source.title}» lo explica así: ${correct}`.slice(0, 600),
      };
    }),
  }),
});

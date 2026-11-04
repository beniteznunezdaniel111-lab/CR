import { z } from "zod";
import { definePrompt } from "../../types";
import { asData } from "../shared";
import { trainingSystemPrompt } from "./shared";

export const trainingOutlineInputSchema = z.object({
  topic: z.string().max(2000).nullable(),
  audience: z.string().max(300).nullable(),
  /** Texto de los documentos elegidos (ya recortado). */
  sourceText: z.string().max(60_000).nullable(),
  moduleCount: z.number().int().min(2).max(8),
});

export type TrainingOutlineInput = z.infer<typeof trainingOutlineInputSchema>;

export const trainingOutlineOutputSchema = z.object({
  title: z.string().min(2).max(150),
  description: z.string().min(10).max(800),
  modules: z
    .array(
      z.object({
        title: z.string().min(2).max(150),
        objective: z.string().min(5).max(400),
      }),
    )
    .min(2)
    .max(8),
});

export type TrainingOutlineOutput = z.infer<typeof trainingOutlineOutputSchema>;

const MOCK_MODULES = [
  ["Introducción y objetivos", "Entender para qué sirve esta formación y qué se espera de ti."],
  ["Conceptos clave", "Conocer los conceptos y normas principales del tema."],
  ["Cómo se hace paso a paso", "Aplicar el procedimiento correcto en el día a día."],
  ["Casos prácticos", "Resolver situaciones habituales con ejemplos reales."],
  ["Errores frecuentes", "Detectar y evitar los errores más comunes."],
  ["Buenas prácticas", "Incorporar hábitos que facilitan el trabajo del equipo."],
  ["Dudas y contactos", "Saber a quién acudir y dónde consultar la información."],
  ["Repaso final", "Repasar lo esencial antes del test."],
] as const;

/** Paso 1 de la generación: título, descripción e índice de módulos. */
export const trainingOutlineV1 = definePrompt({
  id: "training.outline",
  version: 1,
  feature: "trainings",
  description: "Índice de una formación (título, descripción y módulos con su objetivo)",
  effort: "medium",
  maxOutputTokens: 3000,
  input: trainingOutlineInputSchema,
  output: trainingOutlineOutputSchema,
  system: (ctx) =>
    trainingSystemPrompt(ctx, [
      "Tarea: propón el índice de la formación.",
      "- title: título claro (máx. 12 palabras). description: para qué sirve y a quién va dirigida, en 2-3 frases.",
      "- modules: exactamente el número de módulos pedido, en orden lógico, cada uno con un title breve y un objective de aprendizaje concreto (qué sabrá hacer la persona al terminarlo).",
    ]),
  user: (input) =>
    [
      input.topic ? asData("tema", input.topic) : null,
      input.sourceText ? asData("documentos", input.sourceText) : null,
      input.audience ? asData("destinatarios", input.audience) : null,
      `Número de módulos: ${input.moduleCount}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  mock: (input) => {
    const subject =
      (input.topic ?? "").trim().split("\n")[0]!.slice(0, 100) || "la documentación interna";
    return {
      title: `Formación: ${subject}`.slice(0, 150),
      description:
        `Formación práctica sobre ${subject}${input.audience ? ` para ${input.audience}` : ""}. Incluye ejemplos y un test final.`.slice(
          0,
          800,
        ),
      modules: MOCK_MODULES.slice(0, input.moduleCount).map(([title, objective]) => ({
        title,
        objective,
      })),
    };
  },
});

import { z } from "zod";
import { tokenize } from "../../embeddings/mock";
import { definePrompt } from "../../types";
import { asData } from "../shared";
import { trainingSystemPrompt } from "./shared";

export const trainingModuleInputSchema = z.object({
  trainingTitle: z.string().min(2).max(200),
  moduleTitle: z.string().min(2).max(200),
  objective: z.string().max(600),
  position: z.number().int().min(1).max(30),
  /** Títulos del resto de módulos (para no repetir contenido). */
  otherModules: z.array(z.string().max(200)).max(30),
  audience: z.string().max(300).nullable(),
  sourceText: z.string().max(60_000).nullable(),
});

export type TrainingModuleInput = z.infer<typeof trainingModuleInputSchema>;

export const trainingModuleOutputSchema = z.object({
  content: z.string().min(200).max(15_000),
  examples: z
    .array(
      z.object({ title: z.string().min(2).max(150), description: z.string().min(10).max(800) }),
    )
    .min(1)
    .max(3),
  summary: z.string().min(20).max(800),
});

export type TrainingModuleOutput = z.infer<typeof trainingModuleOutputSchema>;

/** Frases de los documentos que comparten términos con el módulo (para el mock). */
function relevantSentences(sourceText: string | null, about: string, max = 3): string[] {
  if (!sourceText) return [];
  const terms = new Set(tokenize(about));
  return sourceText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 20 && !sentence.startsWith("#"))
    .filter((sentence) => tokenize(sentence).some((term) => terms.has(term)))
    .slice(0, max);
}

/** Paso 2: contenido de un módulo (Markdown), ejemplos y resumen. */
export const trainingModuleV1 = definePrompt({
  id: "training.module",
  version: 1,
  feature: "trainings",
  description: "Contenido de un módulo de formación con ejemplos y resumen",
  effort: "medium",
  maxOutputTokens: 6000,
  input: trainingModuleInputSchema,
  output: trainingModuleOutputSchema,
  system: (ctx) =>
    trainingSystemPrompt(ctx, [
      "Tarea: escribe el contenido de UN módulo de la formación.",
      "- content: Markdown de 300 a 800 palabras, con subtítulos (##), párrafos cortos y listas. Céntrate en el objetivo del módulo y no repitas lo que tratan los otros módulos.",
      "- examples: 1-3 situaciones realistas del día a día (title y description) que muestren cómo aplicar el contenido.",
      "- summary: 3-5 ideas clave en un párrafo breve.",
    ]),
  user: (input) =>
    [
      `Formación: ${input.trainingTitle}`,
      `Módulo ${input.position}: ${input.moduleTitle}`,
      `Objetivo: ${input.objective}`,
      input.otherModules.length ? `Otros módulos: ${input.otherModules.join(" · ")}` : null,
      input.audience ? asData("destinatarios", input.audience) : null,
      input.sourceText ? asData("documentos", input.sourceText) : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
  mock: (input) => {
    const fromSources = relevantSentences(
      input.sourceText,
      `${input.trainingTitle} ${input.moduleTitle} ${input.objective}`,
    );
    const content = [
      `## ${input.moduleTitle}`,
      input.objective,
      "## Lo esencial",
      ...(fromSources.length
        ? fromSources.map((sentence) => `- ${sentence}`)
        : [
            "- Conoce la norma y para qué sirve.",
            "- Aplícala igual en todos los casos.",
            "- Si tienes dudas, consulta a RRHH.",
          ]),
      "## Cómo aplicarlo",
      "Revisa el procedimiento antes de empezar, sigue los pasos en orden y deja constancia de lo que haces. Ante cualquier duda, consulta la política interna o pregunta a RRHH.",
    ].join("\n\n");
    return {
      content,
      examples: [
        {
          title: `Ejemplo: ${input.moduleTitle}`.slice(0, 150),
          description:
            "Una persona del equipo necesita aplicar lo aprendido en una situación habitual y sigue los pasos del módulo.",
        },
      ],
      summary: `Ideas clave de «${input.moduleTitle}»: ${input.objective}`
        .slice(0, 800)
        .padEnd(20, "."),
    };
  },
});

import { z } from "zod";
import { checkInclusiveRules } from "@/lib/inclusive/rules";
import { INCLUSIVE_CATEGORIES, SEVERITIES } from "@/lib/inclusive/types";
import { definePrompt } from "../../types";
import { asData, baseSystemPrompt } from "../shared";

const DOC_FIELDS = ["internal", "linkedin", "jobBoard", "website"] as const;

export const inclusiveReviewInputSchema = z.object({
  internal: z.string().max(20000),
  linkedin: z.string().max(20000),
  jobBoard: z.string().max(20000),
  website: z.string().max(20000),
});

export const inclusiveReviewOutputSchema = z.object({
  findings: z
    .array(
      z.object({
        field: z.enum(DOC_FIELDS),
        excerpt: z.string().min(1).max(300),
        category: z.enum(INCLUSIVE_CATEGORIES),
        severity: z.enum(SEVERITIES),
        explanation: z.string().min(1).max(600),
        suggestion: z.string().min(1).max(600),
      }),
    )
    .max(30),
});

export type InclusiveReviewOutput = z.infer<typeof inclusiveReviewOutputSchema>;

const FIELD_LABELS: Record<(typeof DOC_FIELDS)[number], string> = {
  internal: "descripción interna",
  linkedin: "oferta para LinkedIn",
  jobBoard: "oferta para portal de empleo",
  website: "oferta para la web",
};

/** Revisión de lenguaje inclusivo y no discriminatorio de los cuatro textos de un puesto. */
export const jobInclusiveReviewV1 = definePrompt({
  id: "job.inclusive_review",
  version: 1,
  feature: "jobs",
  description: "Revisión de lenguaje inclusivo y no discriminatorio de descripciones y ofertas",
  effort: "low",
  maxOutputTokens: 8000,
  input: inclusiveReviewInputSchema,
  output: inclusiveReviewOutputSchema,
  system: (ctx) =>
    [
      baseSystemPrompt(ctx),
      "",
      `Eres especialista en igualdad de trato y lenguaje inclusivo en procesos de selección en ${ctx.country.name}.`,
      "Revisa los textos y señala SOLO problemas reales:",
      "- requisitos, preferencias o expresiones que excluyan por edad, sexo o género, estado civil o familiar, origen, nacionalidad o etnia, apariencia, salud o discapacidad, religión, creencias o ideología, u orientación sexual (categorías age, gender, family_marital, origin_nationality, appearance, health_disability, religion_beliefs);",
      ctx.country.employment.payTransparency
        ? "- peticiones del salario actual o anterior de la persona candidata (salary_history);"
        : "",
      "- masculino genérico o formas con @, x o e cuando haya una alternativa natural (gendered_language, gravedad low).",
      "No señales requisitos legítimos del puesto: experiencia, titulaciones, idiomas con nivel, permiso de trabajo, carné de conducir si el puesto lo requiere, ni las declaraciones de igualdad de oportunidades.",
      "Para cada hallazgo indica el texto (field), copia el fragmento EXACTO tal como aparece (máximo 20 palabras), explica brevemente el problema y propone una alternativa concreta.",
      "Si no hay problemas, devuelve una lista vacía.",
    ]
      .filter(Boolean)
      .join("\n"),
  user: (input) =>
    DOC_FIELDS.map((field) => asData(`${field} (${FIELD_LABELS[field]})`, input[field])).join(
      "\n\n",
    ),
  // El mock reutiliza las reglas deterministas para que las demos sean realistas.
  mock: (input, ctx) => ({
    findings: checkInclusiveRules(
      DOC_FIELDS.map((field) => ({ field, text: input[field] })),
      ctx.country.code,
    )
      .slice(0, 30)
      .map((finding) => ({
        field: finding.field as (typeof DOC_FIELDS)[number],
        excerpt: finding.excerpt,
        category: finding.category,
        severity: finding.severity,
        explanation: finding.explanation,
        suggestion: finding.suggestion,
      })),
  }),
});

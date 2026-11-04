import { z } from "zod";
import { Constants } from "@/lib/supabase/database.types";
import { definePrompt, type PromptContext } from "../../types";
import { asData, baseSystemPrompt } from "../shared";

export const interviewGuideInputSchema = z.object({
  job: z.object({
    title: z.string().min(2).max(150),
    level: z.enum(Constants.public.Enums.job_level),
    responsibilities: z.string().min(1).max(6000),
    requirements: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          text: z.string().min(1).max(500),
          kind: z.enum(Constants.public.Enums.requirement_kind),
        }),
      )
      .max(30),
  }),
  /**
   * Guía adaptada a una candidatura: solo su resumen y los requisitos que su CV
   * no acredita del todo (sin nombre ni datos personales).
   */
  candidate: z
    .object({
      summary: z.string().max(4000),
      gaps: z
        .array(
          z.object({
            requirementId: z.string().max(64),
            requirement: z.string().max(500),
            result: z.enum(["partial", "not_found"]),
            note: z.string().max(1000),
          }),
        )
        .max(30),
    })
    .nullable(),
});

export type InterviewGuideInput = z.infer<typeof interviewGuideInputSchema>;

const question = z.string().min(1).max(400);
const lookFor = z.array(z.string().min(1).max(300)).min(1).max(5);

export const interviewGuideOutputSchema = z.object({
  intro: z.string().min(1).max(1200),
  competencies: z
    .array(
      z.object({
        competency: z.string().min(1).max(120),
        questions: z.array(z.object({ question, lookFor })).min(1).max(3),
      }),
    )
    .min(1)
    .max(6),
  technical: z
    .array(z.object({ question, lookFor, requirementId: z.string().max(64).nullable() }))
    .min(1)
    .max(8),
  behavioral: z
    .array(z.object({ question, competency: z.string().min(1).max(120), lookFor }))
    .min(1)
    .max(6),
  candidateFocus: z
    .array(z.object({ question, lookFor, requirementId: z.string().max(64).nullable() }))
    .max(6),
  rubric: z
    .array(
      z.object({
        criterion: z.string().min(1).max(120),
        /** Descriptores de los niveles 1 a 5, en orden. */
        levels: z.array(z.string().min(1).max(300)).length(5),
      }),
    )
    .min(2)
    .max(6),
});

export type InterviewGuideOutput = z.infer<typeof interviewGuideOutputSchema>;

const LEVELS: Record<InterviewGuideInput["job"]["level"], string> = {
  intern: "prácticas",
  junior: "junior",
  mid: "intermedio",
  senior: "senior",
  lead: "responsable de equipo",
  manager: "mánager",
  director: "dirección",
};

function describe(input: InterviewGuideInput): string {
  const lines = [
    `Puesto: ${input.job.title} (nivel ${LEVELS[input.job.level]})`,
    "Responsabilidades:",
    input.job.responsibilities,
    "Requisitos (usa estos id si una pregunta se refiere a uno):",
    ...input.job.requirements.map(
      (req) =>
        `- id=${req.id} · ${req.kind === "required" ? "imprescindible" : "deseable"} · ${req.text}`,
    ),
  ];
  if (input.candidate) {
    lines.push(
      "",
      "Candidatura concreta (resumen de su CV, ya anonimizado):",
      input.candidate.summary || "(sin resumen)",
      "Requisitos que su CV no acredita del todo:",
      ...input.candidate.gaps.map(
        (gap) =>
          `- id=${gap.requirementId} · ${gap.result === "partial" ? "parcial" : "no consta"} · ${gap.requirement}${gap.note ? ` (${gap.note})` : ""}`,
      ),
    );
  }
  return lines.join("\n");
}

/**
 * Guía de entrevista estructurada a partir de un puesto y, si se indica, de una
 * candidatura. Las preguntas se basan solo en el puesto: nunca personales.
 */
export const interviewGuideV1 = definePrompt({
  id: "interview.guide",
  version: 1,
  feature: "interviews",
  description: "Guía de entrevista: competencias, técnicas, STAR y rúbrica de 1 a 5",
  effort: "medium",
  maxOutputTokens: 12000,
  input: interviewGuideInputSchema,
  output: interviewGuideOutputSchema,
  system: (ctx) =>
    [
      baseSystemPrompt(ctx),
      "",
      "Preparas guías de entrevista estructurada para quien entrevista (no para la persona candidata).",
      "Contenido:",
      "- intro: cómo conducir la entrevista (orden, duración orientativa, tomar notas, valorar con la rúbrica al terminar).",
      "- competencies: 3-5 competencias clave del puesto, con 1-2 preguntas cada una.",
      "- technical: preguntas técnicas o de conocimientos ligadas a los requisitos (indica requirementId si aplica).",
      "- behavioral: preguntas de comportamiento para responder con el método STAR (Situación, Tarea, Acción, Resultado), pidiendo un ejemplo real.",
      "- candidateFocus: SOLO si hay una candidatura concreta, 2-4 preguntas para aclarar los requisitos que su CV no acredita del todo; formúlalas con neutralidad, sin decir que el CV no lo menciona. Si no hay candidatura, lista vacía.",
      "- lookFor: para cada pregunta, 2-4 señales concretas que indican una buena respuesta.",
      "- rubric: 3-5 criterios con los descriptores de los niveles 1 a 5 (1 = sin evidencia, 3 = cumple lo esperado, 5 = destaca claramente), basados en hechos observables.",
      "",
      "Reglas obligatorias:",
      "- Las preguntas tratan solo del puesto: experiencia, conocimientos y competencias.",
      "- PROHIBIDO preguntar o valorar edad, planes de familia, hijos, embarazo, estado civil, salud o discapacidad, origen o nacionalidad, religión, ideas políticas, afiliación sindical u orientación sexual.",
      ctx.country.employment.payTransparency
        ? "- No preguntes por el salario actual o anterior (transparencia retributiva de la UE)."
        : "",
      "- La rúbrica valora competencias y evidencias, nunca rasgos personales.",
      `- Las preguntas se dirigen a la persona candidata ${ctx.country.formOfAddress === "usted" ? "de usted" : "tuteándola"}.`,
    ]
      .filter(Boolean)
      .join("\n"),
  user: (input) => asData("puesto", describe(input)),
  mock: (input, ctx) => mockGuide(input, ctx),
});

// ---------------------------------------------------------------------------
// Respuesta determinista para tests, CI y demos sin coste.
// ---------------------------------------------------------------------------
function mockGuide(input: InterviewGuideInput, ctx: PromptContext): InterviewGuideOutput {
  const usted = ctx.country.formOfAddress === "usted";
  const ask = (tu: string, ud: string) => (usted ? ud : tu);
  const requirements = input.job.requirements.slice(0, 5);
  return {
    intro: `Guía de prueba (generada sin IA) para ${input.job.title}. Sigue el orden de las secciones, toma notas de cada respuesta y puntúa con la rúbrica al terminar. Duración orientativa: 45 minutos.`,
    competencies: [
      {
        competency: "Organización",
        questions: [
          {
            question: ask(
              "¿Cómo organizas tu trabajo cuando tienes varias prioridades a la vez?",
              "¿Cómo organiza su trabajo cuando tiene varias prioridades a la vez?",
            ),
            lookFor: ["Método concreto para priorizar", "Seguimiento de plazos"],
          },
        ],
      },
      {
        competency: "Comunicación",
        questions: [
          {
            question: ask(
              "¿Cómo explicas un cambio de procedimiento a tu equipo?",
              "¿Cómo explica un cambio de procedimiento a su equipo?",
            ),
            lookFor: ["Claridad", "Comprueba que se ha entendido"],
          },
        ],
      },
    ],
    technical: (requirements.length > 0
      ? requirements
      : [{ id: "", text: input.job.title, kind: "required" as const }]
    ).map((req) => ({
      question: ask(
        `Cuéntame tu experiencia con «${req.text}».`,
        `Cuéntenos su experiencia con «${req.text}».`,
      ),
      lookFor: ["Ejemplos concretos y recientes", "Resultados medibles"],
      requirementId: req.id || null,
    })),
    behavioral: [
      {
        question: ask(
          "Háblame de una ocasión en la que resolviste un problema urgente en el trabajo: ¿qué pasó, qué hiciste y qué resultado tuvo?",
          "Hábleme de una ocasión en la que resolvió un problema urgente en el trabajo: ¿qué pasó, qué hizo y qué resultado tuvo?",
        ),
        competency: "Resolución de problemas",
        lookFor: ["Situación y tarea claras", "Acciones propias", "Resultado y aprendizaje"],
      },
    ],
    candidateFocus: (input.candidate?.gaps ?? []).slice(0, 4).map((gap) => ({
      question: ask(
        `¿Qué experiencia tienes relacionada con «${gap.requirement}»?`,
        `¿Qué experiencia tiene relacionada con «${gap.requirement}»?`,
      ),
      lookFor: ["Ejemplos concretos", "Nivel de autonomía"],
      requirementId: gap.requirementId || null,
    })),
    rubric: ["Experiencia técnica", "Organización", "Comunicación"].map((criterion) => ({
      criterion,
      levels: [
        "Sin evidencias en la entrevista",
        "Evidencias escasas o poco concretas",
        "Cumple lo esperado para el puesto",
        "Supera lo esperado con ejemplos sólidos",
        "Destaca claramente, con resultados demostrables",
      ],
    })),
  };
}

import { z } from "zod";
import { Constants } from "@/lib/supabase/database.types";
import { definePrompt } from "../../types";
import { asData, baseSystemPrompt } from "../shared";

export const onboardingPlanInputSchema = z.object({
  title: z.string().min(2).max(150),
  level: z.enum(Constants.public.Enums.job_level),
  department: z.string().max(120).nullable(),
  workMode: z.enum(Constants.public.Enums.work_mode),
  location: z.string().max(150).nullable(),
  responsibilities: z.string().min(1).max(6000),
  requirements: z
    .array(
      z.object({
        text: z.string().min(1).max(500),
        kind: z.enum(Constants.public.Enums.requirement_kind),
      }),
    )
    .max(30),
});

export type OnboardingPlanInput = z.infer<typeof onboardingPlanInputSchema>;

export const ONBOARDING_PHASES = Constants.public.Enums.onboarding_phase;

export const onboardingPlanOutputSchema = z.object({
  title: z.string().min(2).max(200),
  intro: z.string().max(1500),
  tasks: z
    .array(
      z.object({
        phase: z.enum(ONBOARDING_PHASES),
        title: z.string().min(2).max(200),
        description: z.string().max(1000),
        owner: z.string().max(100),
        materials: z.string().max(500),
        isCheckpoint: z.boolean(),
        dueDay: z.number().int().min(1).max(90),
      }),
    )
    .min(6)
    .max(40),
});

export type OnboardingPlanOutput = z.infer<typeof onboardingPlanOutputSchema>;

const WORK_MODES: Record<OnboardingPlanInput["workMode"], string> = {
  onsite: "presencial",
  hybrid: "híbrida",
  remote: "en remoto",
};

/** Plan de incorporación de 30/60/90 días para un puesto (plantilla editable). */
export const onboardingPlanV1 = definePrompt({
  id: "onboarding.plan",
  version: 1,
  feature: "onboarding",
  description: "Plan de onboarding 30/60/90 con tareas, responsables, materiales y checkpoints",
  effort: "medium",
  maxOutputTokens: 12000,
  input: onboardingPlanInputSchema,
  output: onboardingPlanOutputSchema,
  system: (ctx) =>
    [
      baseSystemPrompt(ctx),
      "",
      "Diseñas planes de incorporación (onboarding) de 30, 60 y 90 días para un puesto. Es una plantilla: no conoces a la persona que se incorpora.",
      "- title: nombre del plan; intro: objetivo del plan en 2-3 frases.",
      "- tasks: entre 12 y 24 tareas repartidas en las fases d30 (días 1-30: acogida, herramientas, formación inicial), d60 (días 31-60: autonomía progresiva) y d90 (días 61-90: plena autonomía y objetivos).",
      "- Cada tarea: title breve, description concreta, owner (rol responsable: 'RRHH', 'Responsable directo', 'Persona mentora', 'IT', 'La persona que se incorpora'...), materials (documentos o herramientas; vacío si no aplica), dueDay (día del plan en que vence, coherente con su fase).",
      "- Marca con isCheckpoint al menos una reunión de seguimiento al final de cada fase (días 30, 60 y 90).",
      "- Básate en las responsabilidades y requisitos del puesto. No inventes nombres de personas, herramientas concretas de la empresa ni datos que no aparezcan.",
      "- Nada de tareas que dependan de datos personales (salud, familia, etc.).",
    ].join("\n"),
  user: (input) =>
    asData(
      "puesto",
      [
        `Puesto: ${input.title}${input.department ? ` (${input.department})` : ""}`,
        `Modalidad: ${WORK_MODES[input.workMode]}${input.location ? ` · ${input.location}` : ""}`,
        "Responsabilidades:",
        input.responsibilities,
        "Requisitos:",
        ...input.requirements.map(
          (req) => `- ${req.kind === "required" ? "imprescindible" : "deseable"}: ${req.text}`,
        ),
      ].join("\n"),
    ),
  mock: (input) => mockPlan(input),
});

// ---------------------------------------------------------------------------
// Respuesta determinista para tests, CI y demos sin coste.
// ---------------------------------------------------------------------------
function mockPlan(input: OnboardingPlanInput): OnboardingPlanOutput {
  const responsibilities = input.responsibilities
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    title: `Plan de incorporación · ${input.title}`,
    intro: `Plan de prueba (generado sin IA) para que la persona que se incorpore como ${input.title} gane autonomía en 90 días.`,
    tasks: [
      {
        phase: "d30",
        title: "Bienvenida y presentación del equipo",
        description:
          "Recibir a la persona, presentar al equipo y explicar el funcionamiento del área.",
        owner: "RRHH",
        materials: "Manual de bienvenida",
        isCheckpoint: false,
        dueDay: 1,
      },
      {
        phase: "d30",
        title: "Accesos y herramientas de trabajo",
        description: "Dar de alta las cuentas y el equipo necesarios para el puesto.",
        owner: "IT",
        materials: "",
        isCheckpoint: false,
        dueDay: 2,
      },
      ...responsibilities.map((item, index) => ({
        phase: "d30" as const,
        title: `Formación: ${item}`.slice(0, 200),
        description: `Acompañar a la persona en «${item}» con una persona mentora.`.slice(0, 1000),
        owner: "Persona mentora",
        materials: "",
        isCheckpoint: false,
        dueDay: 7 + index * 5,
      })),
      {
        phase: "d30",
        title: "Revisión del primer mes",
        description:
          "Reunión de seguimiento: qué ha ido bien, dudas y objetivos para el segundo mes.",
        owner: "Responsable directo",
        materials: "",
        isCheckpoint: true,
        dueDay: 30,
      },
      {
        phase: "d60",
        title: "Asumir tareas con autonomía",
        description:
          "La persona realiza las tareas principales del puesto con supervisión puntual.",
        owner: "La persona que se incorpora",
        materials: "",
        isCheckpoint: false,
        dueDay: 45,
      },
      {
        phase: "d60",
        title: "Revisión del segundo mes",
        description: "Seguimiento del progreso y ajuste de objetivos.",
        owner: "Responsable directo",
        materials: "",
        isCheckpoint: true,
        dueDay: 60,
      },
      {
        phase: "d90",
        title: "Objetivos del puesto",
        description: "Acordar objetivos para los próximos meses.",
        owner: "Responsable directo",
        materials: "",
        isCheckpoint: false,
        dueDay: 75,
      },
      {
        phase: "d90",
        title: "Cierre del periodo de incorporación",
        description: "Valoración final de la incorporación y del propio plan.",
        owner: "RRHH",
        materials: "Encuesta de incorporación",
        isCheckpoint: true,
        dueDay: 90,
      },
    ],
  };
}

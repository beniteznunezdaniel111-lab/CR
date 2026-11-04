import { z } from "zod";
import { Constants } from "@/lib/supabase/database.types";

/** Datos de un puesto tal como los reciben los prompts del módulo de puestos. */
export const jobPromptInputSchema = z.object({
  title: z.string().min(2).max(150),
  department: z.string().max(120).nullable(),
  level: z.enum(Constants.public.Enums.job_level),
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
  /** Banda salarial ya formateada para el país (p. ej. "28.000 € – 34.000 € brutos al año"). */
  salary: z.string().max(200).nullable(),
  benefits: z.string().max(4000).nullable(),
  tone: z.enum(Constants.public.Enums.job_tone),
});

export type JobPromptInput = z.infer<typeof jobPromptInputSchema>;

export const LEVEL_LABELS: Record<JobPromptInput["level"], string> = {
  intern: "prácticas",
  junior: "junior",
  mid: "intermedio",
  senior: "senior",
  lead: "responsable de equipo",
  manager: "mánager",
  director: "dirección",
};

export const WORK_MODE_LABELS: Record<JobPromptInput["workMode"], string> = {
  onsite: "presencial",
  hybrid: "híbrido",
  remote: "en remoto",
};

export const TONE_LABELS: Record<JobPromptInput["tone"], string> = {
  professional: "profesional y claro",
  friendly: "cercano y cálido, sin perder la profesionalidad",
  dynamic: "dinámico y con energía",
  formal: "formal y sobrio",
};

/** Ficha del puesto en texto, para incluirla dentro de <datos>. */
export function describeJob(job: JobPromptInput): string {
  const required = job.requirements.filter((req) => req.kind === "required");
  const preferred = job.requirements.filter((req) => req.kind === "preferred");
  const lines = [
    `Puesto: ${job.title}`,
    job.department ? `Departamento: ${job.department}` : null,
    `Nivel: ${LEVEL_LABELS[job.level]}`,
    `Modalidad: ${WORK_MODE_LABELS[job.workMode]}`,
    job.location ? `Ubicación: ${job.location}` : null,
    `Responsabilidades clave:\n${job.responsibilities}`,
    required.length
      ? `Requisitos imprescindibles:\n${required.map((req) => `- ${req.text}`).join("\n")}`
      : "Requisitos imprescindibles: (no indicados)",
    preferred.length
      ? `Requisitos deseables:\n${preferred.map((req) => `- ${req.text}`).join("\n")}`
      : null,
    job.salary ? `Banda salarial: ${job.salary}` : "Banda salarial: (no indicada)",
    job.benefits ? `Beneficios:\n${job.benefits}` : "Beneficios: (no indicados)",
  ];
  return lines.filter(Boolean).join("\n");
}

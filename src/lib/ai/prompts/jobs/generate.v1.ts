import { z } from "zod";
import { definePrompt } from "../../types";
import { asData, baseSystemPrompt } from "../shared";
import {
  type JobPromptInput,
  LEVEL_LABELS,
  TONE_LABELS,
  WORK_MODE_LABELS,
  describeJob,
  jobPromptInputSchema,
} from "./shared";

const MIN_TEXT = 150;

export const jobGenerateOutputSchema = z.object({
  internalDescription: z.string().min(MIN_TEXT).max(20000),
  offers: z.object({
    linkedin: z.string().min(MIN_TEXT).max(20000),
    jobBoard: z.string().min(MIN_TEXT).max(20000),
    website: z.string().min(MIN_TEXT).max(20000),
  }),
});

export type JobGenerateOutput = z.infer<typeof jobGenerateOutputSchema>;

/**
 * Genera la descripción interna del puesto y la oferta en tres versiones
 * (LinkedIn, portal de empleo genérico y web propia), en Markdown.
 */
export const jobGenerateV1 = definePrompt({
  id: "job.generate",
  version: 1,
  feature: "jobs",
  description: "Descripción interna del puesto y ofertas de empleo (LinkedIn, portal, web)",
  effort: "medium",
  maxOutputTokens: 16000,
  input: jobPromptInputSchema,
  output: jobGenerateOutputSchema,
  system: (ctx) =>
    [
      baseSystemPrompt(ctx),
      "",
      "Tu tarea: redactar, a partir de la ficha de un puesto, cuatro textos en Markdown:",
      "1. internalDescription — descripción interna para RRHH y responsables, con estas secciones: ## Misión del puesto, ## Responsabilidades, ## Requisitos (con ### Imprescindibles y ### Deseables), ## Competencias clave y ## Condiciones (modalidad, ubicación, banda salarial y beneficios si se indican).",
      "2. offers.linkedin — oferta para LinkedIn: empieza con una frase que enganche y nombre el puesto, párrafos cortos y listas con guiones; sin encabezados con #, sin hashtags ni emojis; termina invitando a presentar la candidatura. Entre 1.300 y 2.500 caracteres.",
      "3. offers.jobBoard — oferta para un portal de empleo genérico, estructurada con: ## Descripción del puesto, ## Funciones, ## Requisitos, ## Se valorará, ## Ofrecemos y ## Condiciones.",
      "4. offers.website — oferta para la web de la empresa, más narrativa: ## Sobre el puesto, ## Qué harás, ## Qué buscamos, ## Qué ofrecemos y ## Cómo presentar tu candidatura.",
      "",
      "Reglas obligatorias:",
      "- Usa SOLO la información de la ficha. No inventes salario, beneficios, tecnologías, tamaño del equipo ni datos de la empresa. Si falta un dato, omite esa parte en vez de suponerla.",
      "- Si la ficha incluye una banda salarial, inclúyela en las cuatro versiones. Si no la incluye, no hables de salario.",
      "- No pidas nunca el salario actual o anterior de las personas candidatas.",
      "- Lenguaje inclusivo: usa formas genéricas ('la persona candidata', 'el equipo', 'quienes se incorporen'); no uses el masculino genérico ni @, x o e. Para el título del puesto puedes usar una forma con barra (p. ej., 'Técnico/a') o neutra.",
      "- No incluyas ningún requisito ni preferencia sobre edad, sexo, estado civil o familiar, origen, nacionalidad, apariencia, salud, religión u orientación. Si la ficha contiene alguno, omítelo (RRHH recibirá un aviso aparte).",
      "- Expresa los idiomas por nivel (p. ej., 'inglés C1'), nunca como 'nativo'.",
      "- No incluyas emails, teléfonos ni enlaces: no los conoces.",
      `- Nombra a la empresa como "${ctx.organizationName}".`,
    ].join("\n"),
  user: (job) =>
    [
      `Redacta los cuatro textos con un tono ${TONE_LABELS[job.tone]}.`,
      asData("ficha_del_puesto", describeJob(job)),
    ].join("\n\n"),
  mock: (job, ctx) => mockTexts(job, ctx.organizationName),
});

// ---------------------------------------------------------------------------
// Respuesta determinista para tests, CI y demos sin coste.
// ---------------------------------------------------------------------------
function bullets(text: string): string {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
}

function mockTexts(job: JobPromptInput, organization: string): JobGenerateOutput {
  const required = job.requirements.filter((req) => req.kind === "required");
  const preferred = job.requirements.filter((req) => req.kind === "preferred");
  const requiredList = required.map((req) => `- ${req.text}`).join("\n") || "- Por definir";
  const preferredList = preferred.map((req) => `- ${req.text}`).join("\n");
  const conditions = [
    `- Modalidad: ${WORK_MODE_LABELS[job.workMode]}`,
    job.location ? `- Ubicación: ${job.location}` : null,
    job.salary ? `- Banda salarial: ${job.salary}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const benefits = job.benefits
    ? bullets(job.benefits)
    : "- Incorporación a un equipo comprometido";
  const level = LEVEL_LABELS[job.level];

  return {
    internalDescription: [
      "## Misión del puesto",
      `La persona que ocupe el puesto de ${job.title} (nivel ${level}) en ${organization} contribuirá a los objetivos del área${job.department ? ` de ${job.department}` : ""}.`,
      "## Responsabilidades",
      bullets(job.responsibilities),
      "## Requisitos",
      "### Imprescindibles",
      requiredList,
      ...(preferredList ? ["### Deseables", preferredList] : []),
      "## Competencias clave",
      "- Organización y orientación a resultados\n- Comunicación y trabajo en equipo",
      "## Condiciones",
      conditions,
      benefits,
    ].join("\n\n"),
    offers: {
      linkedin: [
        `En ${organization} buscamos incorporar a una persona para el puesto de ${job.title}.`,
        "Qué harás:",
        bullets(job.responsibilities),
        "Qué buscamos:",
        requiredList,
        "Qué ofrecemos:",
        benefits,
        conditions,
        "¿Te interesa? Presenta tu candidatura.",
      ].join("\n\n"),
      jobBoard: [
        "## Descripción del puesto",
        `${organization} incorpora ${job.title} (nivel ${level}).`,
        "## Funciones",
        bullets(job.responsibilities),
        "## Requisitos",
        requiredList,
        ...(preferredList ? ["## Se valorará", preferredList] : []),
        "## Ofrecemos",
        benefits,
        "## Condiciones",
        conditions,
      ].join("\n\n"),
      website: [
        "## Sobre el puesto",
        `Queremos sumar al equipo de ${organization} a una persona como ${job.title}.`,
        "## Qué harás",
        bullets(job.responsibilities),
        "## Qué buscamos",
        requiredList,
        "## Qué ofrecemos",
        benefits,
        conditions,
        "## Cómo presentar tu candidatura",
        "Envía tu candidatura a través de esta página.",
      ].join("\n\n"),
    },
  };
}

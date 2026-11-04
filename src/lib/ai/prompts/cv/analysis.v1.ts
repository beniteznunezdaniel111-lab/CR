import { z } from "zod";
import { Constants } from "@/lib/supabase/database.types";
import { definePrompt, type PromptContext } from "../../types";
import { asData, baseSystemPrompt } from "../shared";

export const cvAnalysisInputSchema = z.object({
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
      .min(1)
      .max(30),
  }),
  /** Texto del CV YA anonimizado (sin nombre, contacto ni atributos protegidos). */
  cvText: z.string().min(1).max(60000),
});

export type CvAnalysisInput = z.infer<typeof cvAnalysisInputSchema>;

export const cvAnalysisOutputSchema = z.object({
  summary: z.string().min(1).max(1500),
  profile: z.object({
    headline: z.string().max(200).nullable(),
    experience: z
      .array(
        z.object({
          role: z.string().max(200),
          organization: z.string().max(200).nullable(),
          period: z.string().max(100).nullable(),
          highlights: z.array(z.string().max(300)).max(5),
        }),
      )
      .max(15),
    education: z
      .array(
        z.object({
          title: z.string().max(200),
          institution: z.string().max(200).nullable(),
          period: z.string().max(100).nullable(),
        }),
      )
      .max(10),
    skills: z.array(z.string().max(100)).max(30),
    languages: z
      .array(z.object({ language: z.string().max(60), level: z.string().max(60).nullable() }))
      .max(10),
    certifications: z.array(z.string().max(200)).max(15),
  }),
  requirements: z
    .array(
      z.object({
        requirementId: z.string().max(64),
        result: z.enum(Constants.public.Enums.requirement_match),
        evidence: z.string().max(400).nullable(),
        explanation: z.string().max(600),
      }),
    )
    .max(30),
  interviewQuestions: z
    .array(
      z.object({
        question: z.string().min(1).max(400),
        purpose: z.string().max(300),
        requirementId: z.string().max(64).nullable(),
      }),
    )
    .min(1)
    .max(8),
});

export type CvAnalysisOutput = z.infer<typeof cvAnalysisOutputSchema>;

const LEVELS: Record<CvAnalysisInput["job"]["level"], string> = {
  intern: "prácticas",
  junior: "junior",
  mid: "intermedio",
  senior: "senior",
  lead: "responsable de equipo",
  manager: "mánager",
  director: "dirección",
};

function describeJob(job: CvAnalysisInput["job"]): string {
  return [
    `Puesto: ${job.title} (nivel ${LEVELS[job.level]})`,
    "Responsabilidades:",
    job.responsibilities,
    "Requisitos que debes evaluar (usa exactamente estos id):",
    ...job.requirements.map(
      (req) =>
        `- id=${req.id} · ${req.kind === "required" ? "imprescindible" : "deseable"} · ${req.text}`,
    ),
  ].join("\n");
}

/**
 * Paso 2 del análisis de un CV: evaluar el CV anonimizado SOLO contra los
 * requisitos del puesto. Es una sugerencia: no puntúa, no ordena y no
 * recomienda avanzar ni descartar. Decide siempre una persona.
 */
export const cvAnalysisV1 = definePrompt({
  id: "cv.analysis",
  version: 1,
  feature: "candidates",
  description: "Resumen de un CV y encaje requisito por requisito, con evidencias y preguntas",
  effort: "medium",
  maxOutputTokens: 12000,
  input: cvAnalysisInputSchema,
  output: cvAnalysisOutputSchema,
  system: (ctx) =>
    [
      baseSystemPrompt(ctx),
      "",
      "Ayudas a RRHH a revisar un CV ya anonimizado. Tu análisis es una SUGERENCIA que revisará una persona, que es quien decide.",
      "",
      "Tareas:",
      "1. requirements: evalúa el CV contra CADA requisito de la lista, uno a uno y usando su id:",
      "   - meets: el CV muestra claramente que se cumple;",
      "   - partial: hay indicios o experiencia relacionada, pero no basta para afirmarlo;",
      "   - not_found: el CV no lo menciona. Significa 'no consta', no 'no lo cumple'.",
      "   - evidence: copia un fragmento LITERAL del CV (máximo 40 palabras) que justifique meets o partial, exactamente como aparece: sin parafrasear, sin puntos suspensivos y sin unir frases distintas. Con not_found, evidence es null.",
      "   - explanation: una o dos frases con el porqué.",
      "2. summary: 3-5 frases sobre la experiencia, formación y habilidades relevantes para el puesto.",
      "3. profile: experiencia, formación, habilidades, idiomas y certificaciones que aparecen en el CV, sin datos de contacto.",
      "4. interviewQuestions: entre 3 y 6 preguntas para aclarar en la entrevista los requisitos parciales o que no constan, o para profundizar en la experiencia clave. Indica para qué sirve cada una y, si aplica, el id del requisito.",
      "",
      "Reglas obligatorias (no negociables):",
      "- Evalúa SOLO contra los requisitos y las responsabilidades del puesto. No valores nada más.",
      "- PROHIBIDO tener en cuenta, inferir o mencionar: edad o fecha de nacimiento, sexo o género, origen, nacionalidad o etnia, estado civil o situación familiar, foto o apariencia, salud o discapacidad, religión o creencias, afiliación política o sindical, orientación sexual. Si el CV contiene alguno de estos datos, ignóralo y no lo cites en ningún campo.",
      "- No des una puntuación, nota, porcentaje ni ranking, y no recomiendes avanzar ni descartar.",
      "- Usa un lenguaje neutro ('la persona candidata'); no supongas el género.",
      "- Las preguntas de entrevista no pueden ser personales (familia, salud, edad, origen, creencias...).",
      ctx.country.employment.payTransparency
        ? "- No preguntes nunca por el salario actual o anterior."
        : "",
      "- Las marcas [dato personal omitido] son datos ocultados a propósito: no intentes deducirlos.",
    ]
      .filter(Boolean)
      .join("\n"),
  user: (input) =>
    [asData("puesto", describeJob(input.job)), asData("cv_anonimizado", input.cvText)].join("\n\n"),
  mock: (input, ctx) => mockAnalysis(input, ctx),
});

// ---------------------------------------------------------------------------
// Respuesta determinista para tests, CI y demos sin coste: compara el texto de
// cada requisito con el CV de forma literal.
// ---------------------------------------------------------------------------
const STOPWORDS = new Set([
  "para",
  "como",
  "con",
  "experiencia",
  "conocimiento",
  "conocimientos",
  "nivel",
  "manejo",
  "capacidad",
  "minimo",
  "anos",
  "sobre",
  "entre",
  "desde",
]);

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findLiteral(text: string, needle: string): string | null {
  const pattern = needle.trim().split(/\s+/).map(escapeRegExp).join("\\s+");
  return pattern ? (text.match(new RegExp(pattern, "iu"))?.[0] ?? null) : null;
}

function significantWords(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

const SECTION = /^[\p{Lu}\s]+$/u;
const MARK = "[dato personal omitido]";

function mockAnalysis(input: CvAnalysisInput, ctx: PromptContext): CvAnalysisOutput {
  const usted = ctx.country.formOfAddress === "usted";
  const lines = input.cvText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(MARK));

  const requirements = input.job.requirements.map((req) => {
    const literal = findLiteral(input.cvText, req.text);
    if (literal) {
      return {
        requirementId: req.id,
        result: "meets" as const,
        evidence: literal,
        explanation: "El CV lo menciona de forma explícita.",
      };
    }
    const words = significantWords(req.text);
    // Requisitos cortos: todas sus palabras clave; largos, al menos la mitad.
    const needed = words.length <= 2 ? words.length : Math.ceil(words.length / 2);
    const line = words.length
      ? lines.find((item) => words.filter((word) => fold(item).includes(word)).length >= needed)
      : undefined;
    if (line) {
      return {
        requirementId: req.id,
        result: "partial" as const,
        evidence: line.slice(0, 400),
        explanation: "El CV recoge experiencia relacionada; conviene confirmarlo en la entrevista.",
      };
    }
    return {
      requirementId: req.id,
      result: "not_found" as const,
      evidence: null,
      explanation: "El CV no lo menciona.",
    };
  });

  const required = input.job.requirements.filter((req) => req.kind === "required");
  const metRequired = requirements.filter(
    (item, index) => input.job.requirements[index]!.kind === "required" && item.result === "meets",
  ).length;

  const open = requirements
    .map((item, index) => ({ item, req: input.job.requirements[index]! }))
    .filter(({ item }) => item.result !== "meets")
    .slice(0, 5);
  const interviewQuestions = [
    ...open.map(({ req }) => ({
      question: usted
        ? `¿Podría contarnos su experiencia relacionada con «${req.text}»?`
        : `¿Puedes contarnos tu experiencia relacionada con «${req.text}»?`,
      purpose: "Aclarar un requisito que el CV no acredita del todo.",
      requirementId: req.id,
    })),
    {
      question: usted
        ? "¿Qué logro de su trayectoria destacaría para este puesto?"
        : "¿Qué logro de tu trayectoria destacarías para este puesto?",
      purpose: "Profundizar en la experiencia más relevante.",
      requirementId: null,
    },
  ];

  const skillsHeader = lines.findIndex((line) => /^(habilidades|competencias|skills)/iu.test(line));
  const skills =
    skillsHeader >= 0 && lines[skillsHeader + 1]
      ? lines[skillsHeader + 1]!.split(/[,;·]/)
          .map((skill) => skill.trim())
          .filter(Boolean)
          .slice(0, 30)
      : [];
  const languages = [
    ...input.cvText.matchAll(
      /(inglés|francés|alemán|portugués|italiano|español|catalán|chino|árabe)\s*(nativo|[ABC][12])?/giu,
    ),
  ]
    .slice(0, 10)
    .map((match) => ({ language: match[1]!, level: match[2] ?? null }));
  const experience = lines
    .map((line) =>
      line.match(/^(\d{4}\s*-\s*(?:\d{4}|actualidad))\s*[·-]\s*(.+?)\s*[·-]\s*(.+)$/iu),
    )
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .slice(0, 15)
    .map((match) => ({
      role: match[2]!.slice(0, 200),
      organization: match[3]!.slice(0, 200),
      period: match[1]!,
      highlights: [],
    }));
  const education = lines
    .filter((line) =>
      /grado|licenciatura|máster|master|técnico en|bachillerato|doctorado/iu.test(line),
    )
    .filter((line) => !experience.some((item) => line.includes(item.role)))
    .slice(0, 10)
    .map((line) => ({ title: line.slice(0, 200), institution: null, period: null }));

  return {
    summary: `Resumen de prueba, generado sin IA: el CV menciona de forma literal ${metRequired} de ${required.length} requisitos imprescindibles. Revisa cada requisito antes de decidir.`,
    profile: {
      headline: lines.find((line) => !SECTION.test(line))?.slice(0, 200) ?? null,
      experience,
      education,
      skills,
      languages,
      certifications: [],
    },
    requirements,
    interviewQuestions: interviewQuestions.slice(0, 8),
  };
}

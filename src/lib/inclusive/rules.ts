/**
 * Revisión determinista de lenguaje inclusivo y no discriminatorio (español).
 *
 * Primera capa, instantánea y gratuita, que complementa la revisión con IA. Está
 * pensada para no dar falsos positivos en frases antidiscriminación ("sin
 * distinción de sexo...", "igualdad de oportunidades entre mujeres y hombres").
 * Los textos son orientativos y están pendientes de revisión legal.
 */
import type { CountryCode } from "@/lib/countries/types";
import type { FindingField, InclusiveCategory, InclusiveFinding, Severity } from "./types";

type Rule = {
  id: string;
  category: InclusiveCategory;
  severity: Severity;
  pattern: RegExp;
  /** Si se omite en frases claramente antidiscriminatorias. */
  skipInProtectiveContext: boolean;
  /** Solo en estos países (p. ej. transparencia salarial UE). */
  countries?: readonly CountryCode[];
  explanation: string;
  suggestion: string;
};

// Límites de palabra con soporte Unicode (\b de JS no reconoce letras acentuadas).
const START = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";
function words(source: string): RegExp {
  return new RegExp(`${START}(?:${source})${END}`, "giu");
}

/** Frases que defienden la igualdad: en ellas no se señalan atributos protegidos. */
const PROTECTIVE_CONTEXT = words(
  "sin distinci[oó]n|igualdad|no discrimina\\p{L}*|independientemente|diversidad|diversa|inclusi[oó]n|inclusiv\\p{L}*|discriminaci[oó]n|equidad|equal opportunit\\p{L}*",
);

const RULES: readonly Rule[] = [
  {
    id: "age_range",
    category: "age",
    severity: "high",
    pattern: words(
      "(?:menor|mayor)(?:es)? de \\d{2} a[nñ]os(?! de experiencia)|entre \\d{2} y \\d{2} a[nñ]os(?! de experiencia)|de \\d{2} a \\d{2} a[nñ]os(?! de experiencia)|hasta (?:los )?\\d{2} a[nñ]os(?! de experiencia)|edad (?:m[aá]xima|m[ií]nima|comprendida|l[ií]mite|entre|de \\d{2})|\\d{2} a[nñ]os de edad",
    ),
    skipInProtectiveContext: true,
    explanation:
      "Limitar o preferir una edad es discriminatorio salvo que la ley lo exija para el puesto.",
    suggestion:
      "Elimina la referencia a la edad y describe la experiencia o capacidades necesarias.",
  },
  {
    id: "age_legal_minimum",
    category: "age",
    severity: "low",
    pattern: words("mayor de edad|mayores de edad"),
    skipInProtectiveContext: true,
    explanation:
      "Solo es admisible si la normativa exige una edad mínima para el puesto (p. ej., venta de alcohol).",
    suggestion: "Mantenlo solo si hay una obligación legal y, en ese caso, indícala.",
  },
  {
    id: "age_words",
    category: "age",
    severity: "medium",
    pattern: words(
      "j[oó]ven(?:es)?|juvenil|reci[eé]n (?:licenciad|titulad|graduad)[oa]s?|generaci[oó]n z|millennials?|nativ[oa]s? digital(?:es)?",
    ),
    skipInProtectiveContext: true,
    explanation: "Puede excluir de forma indirecta a personas por su edad.",
    suggestion:
      "Describe el nivel de experiencia (p. ej., 'sin experiencia previa', 'primer empleo') o el estilo de trabajo del equipo.",
  },
  {
    id: "experience_max",
    category: "age",
    severity: "medium",
    pattern: words("(?:no m[aá]s de|m[aá]ximo(?: de)?|como m[aá]ximo) \\d+ a[nñ]os de experiencia"),
    skipInProtectiveContext: true,
    explanation: "Un máximo de experiencia puede discriminar indirectamente por edad.",
    suggestion: "Indica solo la experiencia mínima necesaria.",
  },
  {
    id: "gender_explicit",
    category: "gender",
    severity: "high",
    pattern: words(
      "var[oó]n(?:es)?|hombres?|mujer(?:es)?|chic[oa]s?|se[nñ]oritas?|sexo (?:masculino|femenino)|g[eé]nero (?:masculino|femenino)",
    ),
    skipInProtectiveContext: true,
    explanation: "Indicar o preferir un sexo o género es discriminatorio.",
    suggestion:
      "Elimina la referencia y usa formas neutras (p. ej., 'la persona que se incorpore').",
  },
  {
    id: "family_marital",
    category: "family_marital",
    severity: "high",
    pattern: words(
      "solter[oa]s?|casad[oa]s?|estado civil|sin (?:cargas|responsabilidades) familiares|sin hij[oa]s|con hij[oa]s|embarazad[oa]s?|embarazo|planes? de (?:tener hijos|maternidad|paternidad)",
    ),
    skipInProtectiveContext: true,
    explanation: "El estado civil o la situación familiar no pueden ser requisito ni criterio.",
    suggestion:
      "Si el puesto necesita disponibilidad especial (viajes, turnos), descríbela sin aludir a la familia.",
  },
  {
    id: "origin_nationality",
    category: "origin_nationality",
    severity: "high",
    pattern: words(
      "nacionalidad (?:espa[nñ]ola|costarricense|europea|comunitaria)|espa[nñ]ol(?:a|es|as)? de (?:origen|nacimiento)|costarricenses? de (?:origen|nacimiento)|origen (?:espa[nñ]ol|extranjero|latino|nacional)|raza|etnia|[eé]tnic[oa]|color de piel",
    ),
    skipInProtectiveContext: true,
    explanation:
      "Exigir un origen o una nacionalidad es discriminatorio (otra cosa es el permiso de trabajo, que sí puede pedirse).",
    suggestion: "Si es necesario, pide 'permiso de trabajo en vigor' en lugar de una nacionalidad.",
  },
  {
    id: "native_language",
    category: "origin_nationality",
    severity: "medium",
    pattern: words(
      "nativ[oa]s?(?! digital)|lengua materna|idioma materno|acento (?:nativo|neutro)",
    ),
    skipInProtectiveContext: true,
    explanation: "Pedir hablantes nativos excluye a personas con el mismo nivel por su origen.",
    suggestion: "Indica el nivel requerido (p. ej., 'C2' o 'nivel bilingüe') según el MCER.",
  },
  {
    id: "appearance",
    category: "appearance",
    severity: "high",
    pattern: words(
      "buena presencia|presencia f[ií]sica|aspecto f[ií]sico|atractiv[oa]s?|delgad[oa]s?|talla (?:\\d+|peque[nñ]a)|altura m[ií]nima|estatura",
    ),
    skipInProtectiveContext: true,
    explanation: "La apariencia física no puede ser un requisito para el puesto.",
    suggestion:
      "Si hay normas de vestimenta o de imagen corporativa, descríbelas como condiciones del puesto.",
  },
  {
    id: "appearance_soft",
    category: "appearance",
    severity: "medium",
    pattern: words(
      "imagen (?:f[ií]sica|cuidada|personal cuidada)|aspecto cuidado|sin tatuajes|sin piercings?",
    ),
    skipInProtectiveContext: true,
    explanation: "Puede excluir a personas por su apariencia sin relación con el trabajo.",
    suggestion: "Describe el código de vestimenta, si lo hay, sin juzgar la apariencia.",
  },
  {
    id: "health",
    category: "health_disability",
    severity: "medium",
    pattern: words(
      "buena salud|perfecto estado de salud|estado de salud|sin discapacidad|libre de enfermedades|apt[oa]s? f[ií]sicamente|certificado m[eé]dico",
    ),
    skipInProtectiveContext: true,
    explanation:
      "La salud o la discapacidad no pueden ser criterio salvo exigencias objetivas del puesto.",
    suggestion:
      "Describe las tareas físicas concretas del puesto (p. ej., 'manipular cargas de hasta 15 kg').",
  },
  {
    id: "religion_beliefs",
    category: "religion_beliefs",
    severity: "high",
    pattern: words(
      "religi[oó]n|religios[oa]s?|cat[oó]lic[oa]s?|cristian[oa]s?|musulman(?:es|as?)?|musulm[aá]n|jud[ií][oa]s?|creyentes?|practicantes?|ideolog[ií]a|afiliaci[oó]n (?:pol[ií]tica|sindical)",
    ),
    skipInProtectiveContext: true,
    explanation: "Las creencias, la ideología o la afiliación no pueden ser requisito.",
    suggestion: "Elimina la referencia.",
  },
  {
    id: "salary_history",
    category: "salary_history",
    severity: "high",
    pattern: words(
      "(?:salario|sueldo|retribuci[oó]n|remuneraci[oó]n|n[oó]mina)(?: bruta| bruto| neta| neto)? (?:actual|anterior|previ[oa])|historial salarial|[uú]ltima n[oó]mina|cu[aá]nto cobras",
    ),
    skipInProtectiveContext: false,
    countries: ["ES"],
    explanation:
      "La Directiva (UE) 2023/970 prohíbe preguntar a las personas candidatas por su salario actual o anterior.",
    suggestion: "Elimina la pregunta; puedes informar de la banda salarial del puesto.",
  },
  {
    id: "gendered_language",
    category: "gendered_language",
    severity: "low",
    pattern: words(
      "el candidato(?! o la candidata)|los candidatos(?! y las candidatas)|el trabajador|los trabajadores|el empleado|los empleados|el aspirante|los aspirantes|los interesados|candidat@s?|candidatxs?|tod@s|todxs|l@s",
    ),
    skipInProtectiveContext: false,
    explanation: "El masculino genérico y las formas con @ o x no son inclusivos ni accesibles.",
    suggestion:
      "Usa formas genéricas: 'la persona candidata', 'el equipo', 'quienes se incorporen', 'te/le ofrecemos'.",
  },
];

/** Divide en frases conservando el texto original (para el contexto protector). */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?;:])\s+|\n+/u).filter((part) => part.trim().length > 0);
}

function normalize(value: string): string {
  return value.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

function findingKey(field: string, id: string, excerpt: string): string {
  return `${field}:${id}:${normalize(excerpt)}`;
}

export type RuleCheckInput = { field: FindingField; text: string };

/** Aplica las reglas a uno o varios textos. Sin duplicados por campo y fragmento. */
export function checkInclusiveRules(
  inputs: readonly RuleCheckInput[],
  country: CountryCode,
): InclusiveFinding[] {
  const findings = new Map<string, InclusiveFinding>();

  for (const { field, text } of inputs) {
    if (!text.trim()) continue;
    for (const sentence of sentences(text)) {
      PROTECTIVE_CONTEXT.lastIndex = 0;
      const protective = PROTECTIVE_CONTEXT.test(sentence);
      for (const rule of RULES) {
        if (rule.countries && !rule.countries.includes(country)) continue;
        if (protective && rule.skipInProtectiveContext) continue;
        rule.pattern.lastIndex = 0;
        for (const match of sentence.matchAll(rule.pattern)) {
          const excerpt = match[0];
          const key = findingKey(field, rule.id, excerpt);
          if (!findings.has(key)) {
            findings.set(key, {
              key,
              source: "rules",
              field,
              category: rule.category,
              severity: rule.severity,
              excerpt,
              explanation: rule.explanation,
              suggestion: rule.suggestion,
            });
          }
        }
      }
    }
  }

  return [...findings.values()];
}

/** ¿Aparece el fragmento literalmente (salvo mayúsculas y espacios) en el texto? */
export function excerptAppearsIn(excerpt: string, text: string): boolean {
  const needle = normalize(excerpt);
  return needle.length > 0 && normalize(text).includes(needle);
}

export const RULE_IDS = RULES.map((rule) => rule.id);

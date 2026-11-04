/**
 * Detector de menciones a atributos protegidos en textos generados por la IA
 * sobre una persona (análisis de CVs, guías de entrevista...).
 *
 * La IA no debe tener en cuenta ni mencionar edad, sexo, origen, estado civil,
 * salud, religión, etc. El prompt lo prohíbe; esto es la red de seguridad: las
 * frases que los mencionan se retiran antes de guardarlas y se registra qué
 * salvaguarda saltó (sin el texto). Evita falsos positivos frecuentes en CVs
 * ("sector salud", "mayor experiencia", "inglés nativo").
 */
import type { CountryCode } from "@/lib/countries/types";
import type { InclusiveCategory } from "./types";

const START = "(?<![\\p{L}\\p{N}])";
const END = "(?![\\p{L}\\p{N}])";
function words(source: string): RegExp {
  return new RegExp(`${START}(?:${source})${END}`, "giu");
}

type MentionRule = {
  category: InclusiveCategory;
  pattern: RegExp;
  /** Solo en estos países (p. ej. historial salarial con transparencia retributiva). */
  countries?: readonly CountryCode[];
};

const RULES: readonly MentionRule[] = [
  {
    category: "age",
    pattern: words(
      "edad|a[nñ]os de edad|joven|j[oó]venes|juventud|nacid[oa]s?|fecha de nacimiento|millennials?|generaci[oó]n z|jubilad[oa]s?",
    ),
  },
  {
    category: "gender",
    pattern: words(
      "sexo|g[eé]nero|hombres?|mujer(?:es)?|var[oó]n(?:es)?|masculin[oa]s?|femenin[oa]s?",
    ),
  },
  {
    category: "family_marital",
    pattern: words(
      "estado civil|casad[oa]s?|solter[oa]s?|divorciad[oa]s?|viud[oa]s?|hij[oa]s?|embaraz\\p{L}*|maternidad|paternidad|cargas familiares|c[oó]nyuges?",
    ),
  },
  {
    category: "origin_nationality",
    pattern: words(
      "nacionalidad(?:es)?|extranjer[oa]s?|inmigrantes?|etnias?|[eé]tnic[oa]s?|raza|racial(?:es)?|pa[ií]s de origen",
    ),
  },
  {
    category: "appearance",
    pattern: words(
      "apariencia|aspecto f[ií]sico|buena presencia|atractiv[oa]s?|foto(?:graf[ií]a)? del cv",
    ),
  },
  {
    category: "health_disability",
    pattern: words(
      "discapacidad(?:es)?|enfermedad(?:es)?|estado de salud|baja m[eé]dica|minusval\\p{L}*",
    ),
  },
  {
    category: "religion_beliefs",
    pattern: words(
      "religi[oó]n|religios[oa]s?|creencias? (?:religiosas?|pol[ií]ticas?)|ideolog[ií]as?|afiliaci[oó]n (?:sindical|pol[ií]tica)|sindicat[oa]s?|partido pol[ií]tico",
    ),
  },
  {
    category: "other",
    pattern: words(
      "orientaci[oó]n sexual|homosexual(?:es)?|heterosexual(?:es)?|bisexual(?:es)?|lesbianas?|gais|gays?",
    ),
  },
  {
    category: "salary_history",
    pattern: words(
      "(?:salario|sueldo|retribuci[oó]n) (?:actual|anterior)|cu[aá]nto (?:cobras|cobra|ganas|gana)",
    ),
    countries: ["ES"],
  },
];

export type ProtectedMention = { category: InclusiveCategory; excerpt: string };

export function findProtectedMentions(text: string, country: CountryCode): ProtectedMention[] {
  const mentions: ProtectedMention[] = [];
  for (const rule of RULES) {
    if (rule.countries && !rule.countries.includes(country)) continue;
    for (const match of text.matchAll(rule.pattern)) {
      mentions.push({ category: rule.category, excerpt: match[0] });
    }
  }
  return mentions;
}

/**
 * Quita las frases que mencionan atributos protegidos. Devuelve el texto limpio y
 * las categorías encontradas (vacío si no había ninguna).
 */
export function removeProtectedSentences(
  text: string,
  country: CountryCode,
): { text: string; categories: InclusiveCategory[] } {
  const categories = new Set<InclusiveCategory>();
  const kept = text.split(/(?<=[.!?])\s+/).filter((sentence) => {
    const mentions = findProtectedMentions(sentence, country);
    for (const mention of mentions) categories.add(mention.category);
    return mentions.length === 0;
  });
  return { text: kept.join(" ").trim(), categories: [...categories] };
}

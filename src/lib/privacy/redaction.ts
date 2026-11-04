/**
 * Anonimización del texto de un CV antes de que lo vea la IA que evalúa.
 *
 * Quita datos identificativos y de contacto (nombre, email, teléfono, enlaces,
 * dirección) y las líneas con atributos protegidos (fecha de nacimiento, edad,
 * nacionalidad, estado civil, documento de identidad...). Es determinista y
 * conservadora: ante la duda, oculta. El resultado lo puede leer RRHH aunque el
 * puesto sea anónimo, así que tampoco debe dejar pasar la identidad.
 */
export type CandidateIdentity = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: string[];
};

export const EMPTY_IDENTITY: CandidateIdentity = Object.freeze({
  fullName: null,
  email: null,
  phone: null,
  location: null,
  links: [],
}) as CandidateIdentity;

export const REDACTION_MARK = "[dato personal omitido]";

export type RedactionCounts = {
  emails: number;
  phones: number;
  links: number;
  names: number;
  lines: number;
};

// Límites de palabra con soporte Unicode (\b de JS no reconoce letras acentuadas).
const WORD = "\\p{L}\\p{N}";
const START = `(?<![${WORD}])`;
const END = `(?![${WORD}])`;

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}/gu;
const URL = new RegExp(
  `${START}(?:https?:\\/\\/|www\\.)[^\\s<>()"']+|${START}(?:[a-z0-9-]+\\.)*(?:linkedin|github|gitlab|behance|dribbble|twitter|x|instagram|facebook|tiktok|medium)\\.com\\/[^\\s<>()"']*`,
  "giu",
);
// Secuencias de 8 a 15 dígitos con separadores simples (+34 612 345 678, 8888-1234).
const PHONE_CANDIDATE =
  /(?<![\p{L}\p{N}+])(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d(?:[\s.-]?\d){7,14}(?!\p{N})/gu;
const YEAR_RANGE = /^(?:19|20)\d{2}\s*[-.]\s*(?:19|20)\d{2}$/;
const THOUSANDS = /^\d{1,3}(?:\.\d{3})+$/;

// Líneas que empiezan por una etiqueta de dato personal o de contacto.
const SENSITIVE_LABEL = new RegExp(
  `^\\s*(?:[-•*·]\\s*)?(?:fecha de nacimiento|f\\. ?de nacimiento|f\\. ?nac\\.?|lugar de nacimiento|nacid[oa]|edad|estado civil|nacionalidad|sexo|g[eé]nero|religi[oó]n|dni|nie|nif|pasaporte|c[eé]dula(?: de identidad)?|n[uú]mero de (?:la )?seguridad social|nss|hijos|hijas|discapacidad|direcci[oó]n|domicilio|residencia|tel[eé]fono(?: m[oó]vil)?|m[oó]vil|celular|whatsapp|e-?mail|correo(?: electr[oó]nico)?)${END}`,
  "iu",
);
// Líneas de dirección postal.
const ADDRESS_LINE =
  /^\s*(?:[-•*·]\s*)?(?:c\/|calle|avda\.?|avenida|av\.|plaza|pza\.?|paseo|camino|carretera|urbanizaci[oó]n|residencial|apartado postal)(?=\s|\.)/iu;
// Edad dentro de una frase: "(34 años)", "34 años de edad".
const INLINE_AGE = /\(\s*\d{2}\s*a[nñ]os\s*\)|\d{2}\s*a[nñ]os de edad/giu;

const NAME_PARTICLES = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "y",
  "e",
  "da",
  "das",
  "do",
  "dos",
  "di",
  "van",
  "von",
  "der",
  "san",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

function nameTokens(fullName: string): string[] {
  return fullName
    .split(/\s+/)
    .map((token) => token.replace(/[^\p{L}'’-]/gu, ""))
    .filter((token) => token.length >= 3 && !NAME_PARTICLES.has(token.toLowerCase()));
}

/** Primera línea con aspecto de nombre propio (2-4 palabras en mayúscula inicial). */
const NAME_LINE = /^\p{Lu}[\p{L}'’-]+(?:\s+(?:(?:de|del|la|y)\s+)?\p{Lu}[\p{L}'’-]+){1,3}$/u;

function replaceCounting(
  text: string,
  pattern: RegExp,
  counter: () => void,
  accept: (match: string) => boolean = () => true,
): string {
  return text.replace(pattern, (match) => {
    if (!accept(match)) return match;
    counter();
    return REDACTION_MARK;
  });
}

/** Oculta email, teléfono, enlaces y nombre en un texto (sin reglas de líneas). */
export function redactIdentity(
  text: string,
  identity: CandidateIdentity,
  counts: RedactionCounts = { emails: 0, phones: 0, links: 0, names: 0, lines: 0 },
): string {
  let result = replaceCounting(text, EMAIL, () => counts.emails++);
  result = replaceCounting(result, URL, () => counts.links++);
  for (const link of identity.links) {
    const trimmed = link.trim();
    if (trimmed.length >= 6) {
      result = replaceCounting(
        result,
        new RegExp(escapeRegExp(trimmed), "giu"),
        () => counts.links++,
      );
    }
  }

  const knownPhone = identity.phone ? digitsOf(identity.phone) : "";
  result = replaceCounting(
    result,
    PHONE_CANDIDATE,
    () => counts.phones++,
    (match) => {
      const digits = digitsOf(match);
      if (knownPhone.length >= 8 && digits.endsWith(knownPhone.slice(-8))) return true;
      if (digits.length < 8 || digits.length > 15) return false;
      const trimmed = match.trim();
      return !YEAR_RANGE.test(trimmed) && !THOUSANDS.test(trimmed);
    },
  );

  if (identity.location && /\d/.test(identity.location) && identity.location.trim().length >= 6) {
    result = replaceCounting(
      result,
      new RegExp(escapeRegExp(identity.location.trim()), "giu"),
      () => counts.lines++,
    );
  }

  const fullName = identity.fullName?.trim();
  if (fullName) {
    const tokens = nameTokens(fullName);
    if (tokens.length > 0) {
      const full = new RegExp(
        `${START}${fullName.split(/\s+/).map(escapeRegExp).join("\\s+")}${END}`,
        "giu",
      );
      result = replaceCounting(result, full, () => counts.names++);
      for (const token of tokens) {
        // Solo con mayúscula inicial: evita borrar palabras comunes ("rosa", "mar").
        result = replaceCounting(
          result,
          new RegExp(`${START}${escapeRegExp(token)}${END}`, "giu"),
          () => counts.names++,
          (match) => /^\p{Lu}/u.test(match),
        );
      }
    }
  }
  return result;
}

/**
 * Datos de contacto evidentes en un texto (sin IA): primer email, primer
 * teléfono, enlaces y la primera línea si parece un nombre. Lo usa el proveedor
 * simulado de IA y sirve de respaldo si la extracción con IA no devuelve nada.
 */
export function detectContacts(text: string): CandidateIdentity {
  const firstLine = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  const phone = [...text.matchAll(PHONE_CANDIDATE)]
    .map((match) => match[0].trim())
    .find((candidate) => {
      const digits = digitsOf(candidate);
      return (
        digits.length >= 8 &&
        digits.length <= 15 &&
        !YEAR_RANGE.test(candidate) &&
        !THOUSANDS.test(candidate)
      );
    });
  return {
    fullName: firstLine && firstLine.length <= 60 && NAME_LINE.test(firstLine) ? firstLine : null,
    email: text.match(EMAIL)?.[0] ?? null,
    phone: phone ?? null,
    location: null,
    links: [...new Set([...text.matchAll(URL)].map((match) => match[0]))].slice(0, 10),
  };
}

/**
 * Anonimiza el texto de un CV. `identity` es lo que la extracción identificó;
 * aunque venga vacía, se ocultan emails, teléfonos, enlaces y líneas sensibles.
 */
export function redactCvText(
  text: string,
  identity: CandidateIdentity,
): { text: string; counts: RedactionCounts } {
  const counts: RedactionCounts = { emails: 0, phones: 0, links: 0, names: 0, lines: 0 };

  let firstContentLine = true;
  const lines = text.split("\n").map((line) => {
    const isContent = line.trim().length > 0;
    const isFirst = isContent && firstContentLine;
    if (isContent) firstContentLine = false;

    if (SENSITIVE_LABEL.test(line) || ADDRESS_LINE.test(line)) {
      counts.lines++;
      return REDACTION_MARK;
    }
    if (isFirst && !identity.fullName && NAME_LINE.test(line.trim()) && line.trim().length <= 60) {
      counts.names++;
      return REDACTION_MARK;
    }
    return line.replace(INLINE_AGE, () => {
      counts.lines++;
      return REDACTION_MARK;
    });
  });

  const redacted = redactIdentity(lines.join("\n"), identity, counts)
    // Marcas consecutivas en la misma línea o en líneas seguidas: una sola.
    .replace(new RegExp(`(?:${escapeRegExp(REDACTION_MARK)}[\\s·,;|/-]*){2,}`, "g"), (match) =>
      match.includes("\n") ? `${REDACTION_MARK}\n` : `${REDACTION_MARK} `,
    )
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  return { text: redacted.trim(), counts };
}

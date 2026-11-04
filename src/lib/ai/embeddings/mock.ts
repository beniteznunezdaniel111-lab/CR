import { estimateTokens } from "../tokens";
import { EMBEDDING_DIMENSIONS, type EmbeddingProvider } from "./types";

export const MOCK_EMBEDDING_MODEL = "mock-hash-v1";

/** Palabras vacías frecuentes en español (no aportan significado al comparar). */
const STOPWORDS = new Set(
  (
    "que los las del por para con una unos unas como mas pero sus les este esta estos estas " +
    "ese esa eso esto hay sin sobre entre cuando muy tambien hasta desde donde quien todo " +
    "todos todas nos durante uno otro otra otros otras ante ellos ellas antes algun alguna " +
    "algunos algunas tengo tiene tienen tenemos tienes puedo puede pueden podemos cual cuales " +
    "cuanto cuantos cuanta cuantas como donde cuando porque mis tus son ser fue era esta estan " +
    "estoy has han hemos haber habia usted ustedes nuestro nuestra vuestro"
  ).split(" "),
);

/** Normaliza y divide en términos (sin tildes, minúsculas, plurales simples). */
export function tokenize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
    .map((token) => (token.length > 4 && token.endsWith("es") ? token.slice(0, -2) : token))
    .map((token) => (token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token));
}

/** FNV-1a de 32 bits: hash estable y rápido. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Embedding determinista por "hashing trick": cada término suma ±1 en una
 * dimensión. La similitud refleja términos compartidos (no significado), lo
 * justo para tests, CI y demos sin red. Nunca devuelve el vector cero.
 */
export function mockEmbedding(text: string, dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokenize(text)) {
    const hash = fnv1a(token);
    vector[hash % dimensions]! += hash & 0x10000 ? 1 : -1;
  }
  const norm = Math.hypot(...vector);
  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => Math.round((value / norm) * 1e6) / 1e6);
}

export function createMockEmbeddingProvider(): EmbeddingProvider {
  return {
    name: "mock",
    model: MOCK_EMBEDDING_MODEL,
    // Solo coincidencias casi literales: el resto lo encuentra la búsqueda por términos.
    defaultMinSimilarity: 0.6,
    maxBatchSize: 256,
    async embed(texts) {
      return {
        vectors: texts.map((text) => mockEmbedding(text)),
        tokens: texts.reduce((sum, text) => sum + estimateTokens(text), 0),
      };
    },
  };
}

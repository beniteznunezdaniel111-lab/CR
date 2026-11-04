/**
 * Texto de las fuentes de una formación para la IA: se reparte el máximo entre
 * los documentos para que ninguno se quede fuera aunque otro sea muy largo.
 */
import { MAX_SOURCE_CHARS } from "./constants";

export type SourceText = { title: string; content: string };

export function buildSourceText(
  sources: readonly SourceText[],
  max = MAX_SOURCE_CHARS,
): string | null {
  const usable = sources.filter((source) => source.content.trim());
  if (usable.length === 0) return null;

  // Reparto justo: los documentos cortos ceden lo que no usan a los largos.
  const order = usable
    .map((source, index) => ({ index, length: source.content.length }))
    .sort((a, b) => a.length - b.length);
  const budget = new Map<number, number>();
  let remaining = max - usable.reduce((sum, source) => sum + source.title.length + 8, 0);
  order.forEach((entry, position) => {
    const share = Math.max(0, Math.floor(remaining / (order.length - position)));
    const take = Math.min(entry.length, share);
    budget.set(entry.index, take);
    remaining -= take;
  });

  return usable
    .map((source, index) => {
      const take = budget.get(index) ?? 0;
      const text =
        source.content.length > take ? `${source.content.slice(0, take)}…` : source.content;
      return `### ${source.title}\n${text}`;
    })
    .join("\n\n");
}

/** Título por defecto: el indicado, la primera línea del tema o el genérico. */
export function defaultTrainingTitle(
  title: string | undefined,
  topic: string | undefined,
  fallback: string,
): string {
  const fromTopic = topic?.split("\n")[0]?.trim().slice(0, 200);
  const candidate = title?.trim() || (fromTopic && fromTopic.length >= 2 ? fromTopic : "");
  return candidate || fallback;
}

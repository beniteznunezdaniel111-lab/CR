/**
 * Convierte Markdown a texto plano para pegarlo donde no se interpreta Markdown
 * (p. ej. el formulario de ofertas de LinkedIn): sin #, ** ni enlaces en bruto.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .replace(/^#{1,6}[ \t]+(.*)$/gm, (_, title: string) => title.toUpperCase())
    .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/g, "$1")
    .replace(/(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^>[ \t]?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Nombre de fichero seguro a partir de un título ("Técnico/a de logística" → "tecnico-a-de-logistica"). */
export function slugForFilename(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "documento"
  );
}

/** Tipos de fichero admitidos (sin dependencias: se puede usar en el navegador). */
export const PDF_MIME = "application/pdf";
export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const SUPPORTED_MIME_TYPES = [PDF_MIME, DOCX_MIME] as const;
export type SupportedMime = (typeof SUPPORTED_MIME_TYPES)[number];

export function isSupportedMime(mime: string): mime is SupportedMime {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mime);
}

/** Tipo a partir de la extensión, por si el navegador no informa el MIME. */
export function mimeFromFilename(filename: string): SupportedMime | null {
  const extension = filename.toLowerCase().split(".").pop();
  if (extension === "pdf") return PDF_MIME;
  if (extension === "docx") return DOCX_MIME;
  return null;
}

import type { z } from "zod";

/**
 * Estado devuelto por las Server Actions de formularios. Los mensajes de error
 * de campo son claves del espacio de nombres "validation" de messages/es.json.
 */
export type FormState<TData = unknown> =
  | { status: "idle" }
  | { status: "error"; message?: string; fieldErrors?: Record<string, string[]> }
  | { status: "success"; message?: string; data?: TData };

export const idleState: FormState = { status: "idle" };

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    (result[key] ??= []).push(issue.message);
  }
  return result;
}

/** Convierte FormData en objeto plano (los checkbox marcados llegan como "on"). */
export function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

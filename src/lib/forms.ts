import type { z } from "zod";

/**
 * Estado devuelto por las Server Actions de formularios. Los mensajes de error
 * de campo son claves del espacio de nombres "validation" de messages/es.json.
 *
 * `values` devuelve lo que se envió (sin contraseñas): React 19 vacía los
 * formularios tras cada envío y los campos lo usan como defaultValue para no
 * perder lo escrito cuando hay errores.
 */
export type FormState<TData = unknown> =
  | { status: "idle" }
  | {
      status: "error";
      message?: string;
      fieldErrors?: Record<string, string[]>;
      values?: Record<string, string>;
    }
  | { status: "success"; message?: string; data?: TData };

export const idleState: FormState = { status: "idle" };

/** Campos que nunca se devuelven al navegador. */
const SENSITIVE_FIELDS = new Set(["password", "confirmPassword", "token"]);

export function zodFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".") || "_form";
    const list = (result[key] ??= []);
    if (!list.includes(issue.message)) list.push(issue.message);
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

/** Valores enviados, sin campos sensibles, para repoblar el formulario. */
export function submittedValues(formData: FormData): Record<string, string> {
  const values = formDataToObject(formData);
  for (const key of Object.keys(values)) {
    if (SENSITIVE_FIELDS.has(key)) delete values[key];
  }
  return values;
}

export function formError(
  formData: FormData,
  error: { message?: string; fieldErrors?: Record<string, string[]> },
): FormState<never> {
  return { status: "error", ...error, values: submittedValues(formData) };
}

/** Valores a mostrar tras un error (para usar como defaultValue). */
export function valuesFrom(state: FormState<unknown>): Record<string, string> {
  return state.status === "error" ? (state.values ?? {}) : {};
}

export type AiErrorCode =
  | "not_configured"
  | "budget_exceeded"
  | "input_too_large"
  | "refused"
  | "truncated"
  | "invalid_output"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_error";

/** Mensajes aptos para mostrar a la persona usuaria (español). */
const USER_MESSAGES: Record<AiErrorCode, string> = {
  not_configured:
    "La IA no está configurada en este entorno. Contacta con la persona administradora.",
  budget_exceeded:
    "Tu empresa ha alcanzado el límite mensual de uso de IA. Contacta con la persona administradora.",
  input_too_large:
    "El contenido es demasiado largo para procesarlo de una vez. Prueba con un texto más corto.",
  refused:
    "La IA no ha podido generar este contenido. Revisa el texto de entrada e inténtalo de nuevo.",
  truncated: "La respuesta de la IA ha quedado incompleta. Inténtalo de nuevo.",
  invalid_output:
    "La IA ha devuelto una respuesta con un formato inesperado. Inténtalo de nuevo en unos segundos.",
  rate_limited: "Hay mucha demanda en este momento. Espera unos segundos y vuelve a intentarlo.",
  provider_unavailable: "El servicio de IA no está disponible ahora mismo. Inténtalo más tarde.",
  provider_error: "Ha ocurrido un error al llamar a la IA. Inténtalo de nuevo.",
};

export class AiError extends Error {
  readonly code: AiErrorCode;
  readonly userMessage: string;

  constructor(code: AiErrorCode, options: { detail?: string; cause?: unknown } = {}) {
    super(options.detail ? `${code}: ${options.detail}` : code, { cause: options.cause });
    this.name = "AiError";
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

export function isAiError(error: unknown): error is AiError {
  return error instanceof AiError;
}

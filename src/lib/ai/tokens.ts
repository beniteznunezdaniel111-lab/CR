/**
 * Estimación rápida de tokens sin llamar a la API (conservadora para español:
 * ~3 caracteres por token). Para decidir con precisión se usa count_tokens.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/**
 * Límite global de entrada por llamada. Con Claude Haiku 5.5, por encima de
 * 100K tokens de prompt la tarifa se multiplica por 5: nos quedamos por debajo.
 */
export const DEFAULT_MAX_INPUT_TOKENS = 90_000;

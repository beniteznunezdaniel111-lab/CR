import type { z } from "zod";
import type { AiEffort, AiUsageTotals } from "../types";

export type TransportMessage = { role: "user" | "assistant"; content: string };

export type TransportRequest = {
  model: string;
  system: string;
  messages: TransportMessage[];
  maxTokens: number;
  effort: AiEffort;
};

export type TransportStructuredRequest = TransportRequest & { schema: z.ZodType };

export type TransportResponse = {
  stopReason: "end_turn" | "max_tokens" | "refusal" | "other";
  /** Texto de la respuesta (en salidas estructuradas, el JSON). */
  text: string;
  /** Objeto ya parseado por el SDK, si lo hay. */
  parsed: unknown;
  usage: AiUsageTotals;
  model: string;
  requestId: string | null;
  refusalCategory: string | null;
};

/** Frontera con el proveedor: permite sustituirlo en tests sin red. */
export interface AiTransport {
  readonly provider: "anthropic";
  generateStructured(request: TransportStructuredRequest): Promise<TransportResponse>;
  generateText(request: TransportRequest): Promise<TransportResponse>;
  countTokens(request: TransportRequest): Promise<number>;
}

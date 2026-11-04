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
  /** Respuesta en streaming con citas nativas sobre resultados de búsqueda. */
  streamCited(
    request: TransportCitedRequest,
    onEvent: (event: CitedStreamEvent) => void,
  ): Promise<TransportCitedResponse>;
}

/** Fragmento de documento que se envía como bloque `search_result` citable. */
export type SearchResultSource = {
  /** Identificador estable (se devuelve en cada cita). */
  source: string;
  title: string;
  /** Párrafos: cada uno es una unidad citable. */
  blocks: string[];
};

export type TransportCitedRequest = {
  model: string;
  system: string;
  /** Turnos anteriores de la conversación, como texto plano. */
  history: TransportMessage[];
  searchResults: SearchResultSource[];
  /** Texto final del turno del usuario (la pregunta). */
  question: string;
  maxTokens: number;
  effort: AiEffort;
  signal?: AbortSignal;
};

/** Cita de la respuesta: rango de párrafos [start, end) de un resultado. */
export type CitationLocation = {
  searchResultIndex: number;
  startBlockIndex: number;
  endBlockIndex: number;
  citedText: string;
  source: string;
};

export type CitedTextBlock = { text: string; citations: CitationLocation[] };

export type CitedStreamEvent =
  | { type: "text"; block: number; text: string }
  | { type: "citation"; block: number; citation: CitationLocation };

export type TransportCitedResponse = Omit<TransportResponse, "parsed" | "text"> & {
  blocks: CitedTextBlock[];
};

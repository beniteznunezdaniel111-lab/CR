import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiError } from "../errors";
import type {
  AiTransport,
  CitationLocation,
  CitedTextBlock,
  TransportCitedRequest,
  TransportRequest,
  TransportResponse,
  TransportStructuredRequest,
} from "./types";

type SdkMessage = Anthropic.Message & { _request_id?: string | null };

function stopReasonOf(message: Anthropic.Message): TransportResponse["stopReason"] {
  return message.stop_reason === "end_turn" ||
    message.stop_reason === "max_tokens" ||
    message.stop_reason === "refusal"
    ? message.stop_reason
    : "other";
}

function usageOf(message: Anthropic.Message): TransportResponse["usage"] {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
  };
}

function toTransportResponse(message: SdkMessage, parsed: unknown): TransportResponse {
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return {
    stopReason: stopReasonOf(message),
    text,
    parsed,
    usage: usageOf(message),
    model: message.model,
    requestId: message._request_id ?? null,
    refusalCategory: message.stop_details?.category ?? null,
  };
}

/** Solo interesan las citas sobre resultados de búsqueda (las que enviamos). */
function toCitation(citation: Anthropic.CitationsDelta["citation"]): CitationLocation | null {
  if (citation.type !== "search_result_location") return null;
  return {
    searchResultIndex: citation.search_result_index,
    startBlockIndex: citation.start_block_index,
    endBlockIndex: citation.end_block_index,
    citedText: citation.cited_text,
    source: citation.source,
  };
}

/** Traduce los errores tipados del SDK a errores de la app (sin comparar textos). */
function mapError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.RateLimitError)
    return new AiError("rate_limited", { cause: error });
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiError("not_configured", { cause: error, detail: error.message });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiError("provider_error", { cause: error, detail: error.message });
  }
  if (
    error instanceof Anthropic.InternalServerError ||
    error instanceof Anthropic.APIConnectionError
  ) {
    return new AiError("provider_unavailable", { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new AiError("provider_error", { cause: error, detail: error.message });
  }
  return new AiError("provider_error", { cause: error });
}

export function createAnthropicTransport(
  apiKey: string,
  options: { maxRetries?: number; timeoutMs?: number } = {},
): AiTransport {
  // El SDK ya reintenta con espera exponencial ante 408/409/429/5xx y errores de red.
  const client = new Anthropic({
    apiKey,
    maxRetries: options.maxRetries ?? 3,
    timeout: options.timeoutMs ?? 120_000,
  });

  const baseParams = (request: TransportRequest) => ({
    model: request.model,
    max_tokens: request.maxTokens,
    // El system prompt es estable: se marca para la caché de prompts.
    system: [
      {
        type: "text" as const,
        text: request.system,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: request.messages,
    thinking: { type: "adaptive" as const },
  });

  return {
    provider: "anthropic",

    async generateStructured(request: TransportStructuredRequest) {
      try {
        const message = await client.messages.parse({
          ...baseParams(request),
          output_config: { effort: request.effort, format: zodOutputFormat(request.schema) },
        });
        return toTransportResponse(message, message.parsed_output);
      } catch (error) {
        throw mapError(error);
      }
    },

    async generateText(request: TransportRequest) {
      try {
        const message = await client.messages.create({
          ...baseParams(request),
          output_config: { effort: request.effort },
        });
        return toTransportResponse(message, null);
      } catch (error) {
        throw mapError(error);
      }
    },

    async streamCited(request: TransportCitedRequest, onEvent) {
      try {
        // Los resultados van en el último turno del usuario, con citas activadas
        // en todos (las citas son "todo o nada" en una misma petición). Las
        // respuestas anteriores viajan como texto plano.
        const content: Anthropic.ContentBlockParam[] = [
          ...request.searchResults.map((result): Anthropic.SearchResultBlockParam => ({
            type: "search_result",
            source: result.source,
            title: result.title,
            content: result.blocks.map((text) => ({ type: "text" as const, text })),
            citations: { enabled: true },
          })),
          { type: "text", text: request.question },
        ];

        const stream = client.messages.stream(
          {
            model: request.model,
            max_tokens: request.maxTokens,
            system: [
              {
                type: "text" as const,
                text: request.system,
                cache_control: { type: "ephemeral" as const },
              },
            ],
            messages: [...request.history, { role: "user", content }],
            thinking: { type: "adaptive" as const },
            output_config: { effort: request.effort },
          },
          { signal: request.signal },
        );

        // Índice del bloque de contenido → índice del bloque de texto (se ignoran
        // los bloques de razonamiento).
        const textBlocks = new Map<number, number>();
        const blocks: CitedTextBlock[] = [];
        for await (const event of stream) {
          if (event.type === "content_block_start" && event.content_block.type === "text") {
            const block = blocks.length;
            textBlocks.set(event.index, block);
            blocks.push({ text: "", citations: [] });
            if (event.content_block.text) {
              blocks[block]!.text += event.content_block.text;
              onEvent({ type: "text", block, text: event.content_block.text });
            }
            continue;
          }
          if (event.type !== "content_block_delta") continue;
          const block = textBlocks.get(event.index);
          if (block === undefined) continue;
          if (event.delta.type === "text_delta") {
            blocks[block]!.text += event.delta.text;
            onEvent({ type: "text", block, text: event.delta.text });
          } else if (event.delta.type === "citations_delta") {
            const citation = toCitation(event.delta.citation);
            if (citation) {
              blocks[block]!.citations.push(citation);
              onEvent({ type: "citation", block, citation });
            }
          }
        }

        const message = await stream.finalMessage();
        return {
          stopReason: stopReasonOf(message),
          blocks,
          usage: usageOf(message),
          model: message.model,
          requestId: stream.request_id ?? null,
          refusalCategory: message.stop_details?.category ?? null,
        };
      } catch (error) {
        throw mapError(error);
      }
    },

    async countTokens(request: TransportRequest) {
      try {
        const result = await client.messages.countTokens({
          model: request.model,
          system: request.system,
          messages: request.messages,
        });
        return result.input_tokens;
      } catch (error) {
        throw mapError(error);
      }
    },
  };
}

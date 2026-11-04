import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiError } from "../errors";
import type {
  AiTransport,
  TransportRequest,
  TransportResponse,
  TransportStructuredRequest,
} from "./types";

type SdkMessage = Anthropic.Message & { _request_id?: string | null };

function toTransportResponse(message: SdkMessage, parsed: unknown): TransportResponse {
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const stopReason =
    message.stop_reason === "end_turn" ||
    message.stop_reason === "max_tokens" ||
    message.stop_reason === "refusal"
      ? message.stop_reason
      : "other";

  return {
    stopReason,
    text,
    parsed,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
    },
    model: message.model,
    requestId: message._request_id ?? null,
    refusalCategory: message.stop_details?.category ?? null,
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

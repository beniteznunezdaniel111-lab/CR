import type { AiRuntime } from "@/lib/ai/runtime";
import type {
  AiTransport,
  CitedStreamEvent,
  TransportCitedRequest,
  TransportCitedResponse,
  TransportRequest,
  TransportResponse,
  TransportStructuredRequest,
} from "@/lib/ai/transport/types";
import type { AiUsageEntry, BudgetGuard, UsageRecorder } from "@/lib/ai/usage";
import { computeBudgetStatus } from "@/lib/ai/usage";
import { getCountry } from "@/lib/countries";
import type { AiCallContext } from "@/lib/ai/types";

export const CTX: AiCallContext = {
  orgId: "00000000-0000-0000-0000-00000000000a",
  userId: "00000000-0000-0000-0000-0000000000b1",
  organizationName: "Empresa Demo",
  country: getCountry("ES"),
};

export function response(partial: Partial<TransportResponse>): TransportResponse {
  return {
    stopReason: "end_turn",
    text: "",
    parsed: null,
    usage: {
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    },
    model: "claude-haiku-5-5",
    requestId: "req_test",
    refusalCategory: null,
    ...partial,
  };
}

/** Respuesta con citas preparada: eventos que se emiten y respuesta final. */
export type CitedScript = { events: CitedStreamEvent[]; response: TransportCitedResponse };

export function citedResponse(partial: Partial<TransportCitedResponse>): TransportCitedResponse {
  const { text: _text, parsed: _parsed, ...base } = response({});
  return { ...base, blocks: [], ...partial };
}

/** Transporte falso: devuelve las respuestas en orden y guarda las peticiones. */
export class FakeTransport implements AiTransport {
  readonly provider = "anthropic" as const;
  readonly structuredRequests: TransportStructuredRequest[] = [];
  readonly countRequests: TransportRequest[] = [];
  readonly citedRequests: TransportCitedRequest[] = [];
  constructor(
    private readonly responses: Array<TransportResponse | Error>,
    private readonly tokenCount = 100,
    private readonly cited: Array<CitedScript | Error> = [],
  ) {}

  async streamCited(request: TransportCitedRequest, onEvent: (event: CitedStreamEvent) => void) {
    this.citedRequests.push(request);
    const next = this.cited.shift();
    if (!next) throw new Error("FakeTransport sin más respuestas con citas");
    if (next instanceof Error) throw next;
    for (const event of next.events) onEvent(event);
    return next.response;
  }

  async generateStructured(request: TransportStructuredRequest) {
    // Copia: el código bajo test sigue añadiendo mensajes al mismo array.
    this.structuredRequests.push({ ...request, messages: [...request.messages] });
    const next = this.responses.shift();
    if (!next) throw new Error("FakeTransport sin más respuestas");
    if (next instanceof Error) throw next;
    return next;
  }

  async generateText(request: TransportRequest) {
    return this.generateStructured({ ...request, schema: undefined as never });
  }

  async countTokens(request: TransportRequest) {
    this.countRequests.push(request);
    return this.tokenCount;
  }
}

export class MemoryRecorder implements UsageRecorder {
  readonly entries: AiUsageEntry[] = [];
  async record(entry: AiUsageEntry) {
    this.entries.push(entry);
    return this.entries.length;
  }
}

export function budget(limitUsd = 20, spentUsd = 0): BudgetGuard {
  return { check: async () => computeBudgetStatus(limitUsd, spentUsd) };
}

export function runtime(overrides: Partial<AiRuntime> = {}): AiRuntime & { usage: MemoryRecorder } {
  return {
    provider: "anthropic",
    model: "claude-haiku-5-5",
    transport: new FakeTransport([]),
    budget: budget(),
    maxInputTokens: 90_000,
    ...overrides,
    usage: (overrides.usage as MemoryRecorder | undefined) ?? new MemoryRecorder(),
  };
}

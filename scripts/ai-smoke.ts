/**
 * Prueba de humo de la conexión con Claude (llamada real, coste < 0,01 $).
 *
 *   pnpm ai:smoke
 *
 * Requiere ANTHROPIC_API_KEY. No usa la base de datos: el uso se imprime aquí.
 */
// @next/env es CommonJS: en ESM hay que importarlo por defecto.
import nextEnv from "@next/env";
import { generateObject } from "../src/lib/ai/generate";
import { healthcheckV1 } from "../src/lib/ai/prompts/system/healthcheck.v1";
import { DEFAULT_MAX_INPUT_TOKENS } from "../src/lib/ai/tokens";
import { createAnthropicTransport } from "../src/lib/ai/transport/anthropic";
import { computeBudgetStatus } from "../src/lib/ai/usage";
import { getCountry } from "../src/lib/countries";

nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Falta ANTHROPIC_API_KEY.");
    process.exit(1);
  }
  const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5";

  const { data, meta } = await generateObject(
    healthcheckV1,
    { name: "equipo de RRHH" },
    {
      orgId: "00000000-0000-0000-0000-000000000000",
      userId: null,
      organizationName: "Prueba",
      country: getCountry("ES"),
    },
    {
      provider: "anthropic",
      model,
      transport: createAnthropicTransport(apiKey),
      maxInputTokens: DEFAULT_MAX_INPUT_TOKENS,
      budget: { check: async () => computeBudgetStatus(1, 0) },
      usage: {
        record: async (entry) => {
          console.log("Uso:", { ...entry.usage, costUsd: entry.costUsd, status: entry.status });
          return null;
        },
      },
    },
  );
  console.log("Respuesta:", data);
  console.log(`Modelo: ${meta.model} · ${meta.durationMs} ms · request-id ${meta.requestId}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

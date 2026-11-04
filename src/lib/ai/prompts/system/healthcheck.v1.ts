import { z } from "zod";
import { definePrompt } from "../../types";
import { asData, baseSystemPrompt } from "../shared";

/**
 * Prompt mínimo para comprobar la conexión con el proveedor (`pnpm ai:smoke`)
 * y como ejemplo del formato de un prompt versionado.
 */
export const healthcheckV1 = definePrompt({
  id: "system.healthcheck",
  version: 1,
  feature: "system",
  description: "Comprobación de la conexión con la IA",
  effort: "low",
  maxOutputTokens: 2048,
  input: z.object({ name: z.string().min(1).max(80) }),
  output: z.object({
    greeting: z.string().min(1),
    language: z.enum(["es"]),
  }),
  system: (ctx) => baseSystemPrompt(ctx),
  user: (input) =>
    `Saluda en una frase a la persona indicada y confirma el idioma de trabajo.\n${asData("nombre", input.name)}`,
  mock: (input) => ({ greeting: `Hola, ${input.name}. Todo listo.`, language: "es" as const }),
});

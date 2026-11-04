import "server-only";
import { z } from "zod";

/**
 * Variables de entorno del servidor, validadas de forma perezosa (solo cuando se
 * usan) para que `next build` no falle por variables que solo hacen falta en
 * tiempo de ejecución. Documentadas en .env.example.
 */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== "" ? value.trim() : undefined));

/** Una variable vacía (`FOO=`) cuenta como no definida. */
function emptyAsUndefined<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema,
  );
}

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  supabasePublishableKey: z.string().min(1),
  supabaseSecretKey: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  AI_PROVIDER: z.enum(["anthropic", "mock"]).default("anthropic"),
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODEL: z.string().min(1).default("claude-haiku-5-5"),
  // Embeddings de la FAQ: voyage (Voyage AI) o mock (determinista, sin red).
  // Sin valor: voyage si hay VOYAGE_API_KEY y mock si no.
  EMBEDDINGS_PROVIDER: emptyAsUndefined(z.enum(["voyage", "mock"]).optional()),
  VOYAGE_API_KEY: optionalString,
  VOYAGE_MODEL: emptyAsUndefined(z.string().min(1).default("voyage-3.5")),
  // Similitud mínima (0-1) para considerar relevante un fragmento de la FAQ.
  FAQ_MIN_SIMILARITY: emptyAsUndefined(z.coerce.number().min(0).max(1).optional()),
  SIGNUP_ACCESS_CODE: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: optionalString,
  CRON_SECRET: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse({
    ...process.env,
    supabasePublishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Configuración incompleta. Revisa estas variables de entorno: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

/** Solo para tests: fuerza a releer process.env. */
export function resetServerEnvCache() {
  cached = undefined;
}

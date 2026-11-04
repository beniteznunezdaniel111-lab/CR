/**
 * Genera .env.local a partir de `supabase status` (Supabase local en marcha).
 * Conserva las variables que ya tengas (p. ej. ANTHROPIC_API_KEY).
 *
 *   pnpm env:local
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV_FILE = ".env.local";

function parseEnv(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match) result.set(match[1]!, match[2]!);
  }
  return result;
}

const status = parseEnv(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], { encoding: "utf8" }),
);
const pick = (...keys: string[]) => keys.map((key) => status.get(key)).find(Boolean);

const supabaseUrl = pick("API_URL");
const publishableKey = pick("PUBLISHABLE_KEY", "ANON_KEY");
const secretKey = pick("SECRET_KEY", "SERVICE_ROLE_KEY");
const dbUrl = pick("DB_URL");
if (!supabaseUrl || !publishableKey || !secretKey) {
  console.error("No se han podido leer las claves. ¿Está Supabase en marcha? (pnpm db:start)");
  process.exit(1);
}

const current = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : new Map();
const values = new Map<string, string>([
  ["NEXT_PUBLIC_SITE_URL", "http://localhost:3000"],
  ["AI_PROVIDER", "mock"],
  ["ANTHROPIC_MODEL", "claude-haiku-5-5"],
  ["SIGNUP_ACCESS_CODE", "demo"],
  ["SMTP_HOST", "127.0.0.1"],
  ["SMTP_PORT", "54325"],
  ["SMTP_FROM", "HRPilot <no-reply@hrpilot.local>"],
  ...current,
  // Siempre se actualizan desde `supabase status`:
  ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
  ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", publishableKey],
  ["SUPABASE_SECRET_KEY", secretKey],
  ...(dbUrl ? ([["SUPABASE_DB_URL", dbUrl]] as const) : []),
]);

const content = [
  "# Generado por `pnpm env:local`. No subir a git.",
  ...[...values].map(([key, value]) => `${key}=${value}`),
  "",
].join("\n");
writeFileSync(ENV_FILE, content);
console.log(`✓ ${ENV_FILE} actualizado (${values.size} variables).`);

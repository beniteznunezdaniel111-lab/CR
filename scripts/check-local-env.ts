/**
 * Comprobación rápida antes de `pnpm dev`: si faltan las claves de Supabase,
 * explica cómo crearlas en vez de dejar que la app falle al abrirla.
 */
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";

const fromFile = new Map<string, string>();
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match) fromFile.set(match[1]!, match[2]!);
  }
}
const value = (key: string) => process.env[key] || fromFile.get(key);

const hasUrl = Boolean(value("NEXT_PUBLIC_SUPABASE_URL"));
const hasKey = Boolean(
  value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || value("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
);

if (!hasUrl || !hasKey) {
  console.error(
    [
      "",
      `Faltan las claves de Supabase en ${ENV_FILE}, así que la app no puede arrancar.`,
      "",
      "  1. Abre Docker Desktop y espera a que esté en marcha.",
      "  2. pnpm db:start     (la primera vez tarda unos minutos)",
      "  3. pnpm env:local    (crea .env.local)",
      "  4. pnpm db:seed      (empresas de demo)",
      "  5. pnpm dev",
      "",
      "Para ver qué falla exactamente: pnpm diagnose",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

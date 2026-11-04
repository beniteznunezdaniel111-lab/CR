/**
 * Diagnóstico del entorno local: comprueba paso a paso lo necesario para
 * arrancar la app y dice qué hacer si algo falla.
 *
 *   pnpm diagnose
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
] as const;

let failures = 0;
const ok = (message: string) => console.log(`  ✓ ${message}`);
const fail = (message: string, fix: string) => {
  failures++;
  console.log(`  ✗ ${message}\n      → ${fix}`);
};

function parseEnv(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match) result.set(match[1]!, match[2]!);
  }
  return result;
}

function run(command: string): string | null {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return null;
  }
}

console.log("\nDiagnóstico del entorno local\n");
console.log(`  Carpeta: ${process.cwd()}`);

// 1. Node.js
const major = Number(process.versions.node.split(".")[0]);
if (major >= 22) ok(`Node.js ${process.versions.node}`);
else
  fail(
    `Node.js ${process.versions.node} (se necesita la 22 o superior)`,
    "Instala Node.js 22 desde nodejs.org.",
  );

// 2. Carpeta del proyecto
if (existsSync("package.json") && existsSync("supabase/config.toml"))
  ok("Estás en la carpeta del proyecto");
else
  fail(
    "No parece la carpeta del proyecto",
    "Entra en la carpeta CR (cd CR) y vuelve a ejecutar pnpm diagnose.",
  );

// 3. Docker
if (run("docker info") !== null) ok("Docker está en marcha");
else fail("Docker no responde", "Abre Docker Desktop y espera a que indique que está en marcha.");

// 4. Supabase local
const statusText = run("pnpm exec supabase status -o env");
const status = statusText ? parseEnv(statusText) : new Map<string, string>();
const apiUrl = status.get("API_URL");
if (apiUrl) ok(`Supabase local en marcha (${apiUrl})`);
else
  fail(
    "Supabase local no está en marcha",
    "Ejecuta pnpm db:start y espera a que termine (la primera vez tarda unos minutos).",
  );

// 5. .env.local
if (!existsSync(ENV_FILE)) {
  fail(`No existe ${ENV_FILE}`, "Con Supabase en marcha, ejecuta pnpm env:local.");
} else {
  const env = parseEnv(readFileSync(ENV_FILE, "utf8"));
  const missing = REQUIRED.filter((key) => !env.get(key));
  if (missing.length > 0) {
    fail(
      `${ENV_FILE} existe pero faltan: ${missing.join(", ")}`,
      "Ejecuta pnpm env:local (rellena las claves de Supabase).",
    );
  } else if (apiUrl && env.get("NEXT_PUBLIC_SUPABASE_URL") !== apiUrl) {
    fail(
      `${ENV_FILE} apunta a ${env.get("NEXT_PUBLIC_SUPABASE_URL")} y Supabase está en ${apiUrl}`,
      "Ejecuta pnpm env:local para actualizarlo.",
    );
  } else {
    ok(`${ENV_FILE} tiene las claves de Supabase`);
  }
  if (env.get("AI_PROVIDER") === "anthropic" && !env.get("ANTHROPIC_API_KEY")) {
    fail(
      "AI_PROVIDER=anthropic sin ANTHROPIC_API_KEY",
      "Añade tu clave en .env.local o usa AI_PROVIDER=mock.",
    );
  }
}

console.log(
  failures === 0
    ? "\nTodo listo. Si no cargaste los datos de demo: pnpm db:seed. Después: pnpm dev (si ya estaba en marcha, reinícialo).\n"
    : `\n${failures} problema(s). Corrígelos en orden y vuelve a ejecutar pnpm diagnose.\n`,
);
process.exit(failures === 0 ? 0 : 1);

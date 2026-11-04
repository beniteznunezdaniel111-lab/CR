import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests de base de datos (RLS, triggers, RPCs). Necesitan Postgres con el esquema
// aplicado: `pnpm db:start` (Supabase oficial) o `pnpm db:native start` (sin Docker).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});

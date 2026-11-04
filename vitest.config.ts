import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests unitarios (sin red ni base de datos).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` lanza error fuera del runtime de React Server Components.
      "server-only": fileURLToPath(new URL("./tests/support/empty-module.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});

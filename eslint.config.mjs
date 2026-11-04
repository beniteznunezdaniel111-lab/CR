import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@anthropic-ai/sdk",
              message:
                "Usa la capa src/lib/ai: es la única que puede hablar con el proveedor de IA.",
            },
          ],
        },
      ],
    },
  },
  {
    // La capa de IA es la única que puede importar el SDK.
    files: ["src/lib/ai/**/*.ts", "scripts/**/*.ts", "tests/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "supabase/.temp/**",
    "src/lib/supabase/database.types.ts",
  ]),
]);

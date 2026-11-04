import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const CHANGES_STATUS = /set_candidate_status|setCandidateStatus/;

describe("la IA nunca decide sobre una candidatura", () => {
  it("ni la capa de IA ni el procesado de CVs pueden cambiar el estado", () => {
    const files = [
      ...filesUnder("src/lib/ai"),
      ...filesUnder("src/lib/privacy"),
      ...filesUnder("src/lib/extraction"),
      "src/modules/candidates/analysis.ts",
      "src/modules/candidates/retention.ts",
    ];
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(CHANGES_STATUS);
    }
  });

  it("la acción que procesa un CV no llama a la RPC de decisiones", () => {
    const source = readFileSync("src/modules/candidates/actions.ts", "utf8");
    const start = source.indexOf("export async function processCandidateAction");
    const end = source.indexOf("export async function", start + 1);
    expect(start).toBeGreaterThan(0);
    expect(source.slice(start, end)).not.toMatch(CHANGES_STATUS);
  });

  it("el aviso de sugerencia de IA se muestra en las páginas de candidaturas", () => {
    for (const page of [
      "src/app/app/[org]/candidates/page.tsx",
      "src/app/app/[org]/jobs/[jobId]/candidates/page.tsx",
      "src/app/app/[org]/jobs/[jobId]/candidates/[candidateId]/page.tsx",
    ]) {
      expect(readFileSync(page, "utf8"), page).toContain("<AiSuggestionNotice />");
    }
  });
});

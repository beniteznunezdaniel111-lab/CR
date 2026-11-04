import { describe, expect, it } from "vitest";
import { jobGenerateV1 } from "@/lib/ai/prompts/jobs/generate.v1";
import { getCountry } from "@/lib/countries";
import { markdownToPlainText, slugForFilename } from "@/lib/markdown";
import { formatSalaryRange, toPromptInput } from "@/modules/jobs/format";
import type { JobWithRequirements } from "@/modules/jobs/queries";
import { jobFormSchema } from "@/modules/jobs/schemas";

const ORG = "00000000-0000-4000-8000-000000000001";

const form = (overrides: Record<string, string> = {}) => ({
  orgId: ORG,
  title: "Técnico/a de logística",
  level: "mid",
  workMode: "hybrid",
  responsibilities: "Coordinar envíos y gestionar el almacén",
  requirements: JSON.stringify([{ text: "Experiencia en logística", kind: "required" }]),
  ...overrides,
});

describe("formulario de puesto", () => {
  it("acepta un puesto mínimo y lee los requisitos serializados", () => {
    const parsed = jobFormSchema.parse(form());
    expect(parsed.requirements).toEqual([{ text: "Experiencia en logística", kind: "required" }]);
    expect(parsed.tone).toBe("professional");
    expect(parsed.jobId).toBeUndefined();
  });

  it("valida la banda salarial", () => {
    const range = jobFormSchema.safeParse(
      form({ salaryMin: "40000", salaryMax: "30000", salaryCurrency: "EUR", salaryPeriod: "year" }),
    );
    expect(range.error?.issues[0]).toMatchObject({ message: "salaryRange", path: ["salaryMax"] });
    const unit = jobFormSchema.safeParse(form({ salaryMin: "30000" }));
    expect(unit.error?.issues[0]).toMatchObject({ message: "salaryUnit" });
    const ok = jobFormSchema.parse(
      form({
        salaryMin: "28000",
        salaryMax: "34000,5",
        salaryCurrency: "EUR",
        salaryPeriod: "year",
      }),
    );
    expect([ok.salaryMin, ok.salaryMax]).toEqual([28000, 34000.5]);
  });

  it("rechaza requisitos demasiado cortos, demasiados requisitos y JSON inválido", () => {
    expect(
      jobFormSchema.safeParse(
        form({ requirements: JSON.stringify([{ text: "x", kind: "required" }]) }),
      ).error?.issues[0]?.message,
    ).toBe("requirementLength");
    const many = Array.from({ length: 31 }, (_, i) => ({
      text: `Requisito ${i}`,
      kind: "required",
    }));
    expect(
      jobFormSchema.safeParse(form({ requirements: JSON.stringify(many) })).error?.issues[0]
        ?.message,
    ).toBe("tooManyRequirements");
    expect(jobFormSchema.safeParse(form({ requirements: "{no es json" })).success).toBe(false);
  });

  it("descarta ids de requisito que no son uuid (no se pueden reutilizar ids ajenos por error)", () => {
    const parsed = jobFormSchema.parse(
      form({ requirements: JSON.stringify([{ id: "123", text: "Inglés B2", kind: "preferred" }]) }),
    );
    expect(parsed.requirements[0]?.id).toBeUndefined();
  });
});

const JOB: JobWithRequirements = {
  id: "00000000-0000-4000-8000-0000000000aa",
  org_id: ORG,
  title: "Técnico/a de logística",
  department: "Operaciones",
  level: "mid",
  work_mode: "hybrid",
  location: "Madrid",
  responsibilities: "Coordinar envíos\nGestionar el almacén",
  salary_min: 28000,
  salary_max: 34000,
  salary_currency: "EUR",
  salary_period: "year",
  benefits: "Seguro médico",
  tone: "friendly",
  status: "draft",
  anonymous_review: false,
  candidate_seq: 0,
  created_by: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  requirements: [
    { id: "r1", text: "2 años de experiencia", kind: "required", sort_order: 1 },
    { id: "r2", text: "Inglés B2", kind: "preferred", sort_order: 2 },
  ],
};

describe("formato y entrada de los prompts", () => {
  it("formatea la banda salarial según el país", () => {
    const es = getCountry("ES");
    expect(formatSalaryRange(JOB, es)).toMatch(/^28\.000\s€ – 34\.000\s€ brutos al año$/);
    expect(formatSalaryRange({ ...JOB, salary_max: null }, es)).toMatch(/^Desde 28\.000\s€/);
    expect(formatSalaryRange({ ...JOB, salary_min: null, salary_period: "month" }, es)).toMatch(
      /^Hasta 34\.000\s€ brutos al mes$/,
    );
    expect(formatSalaryRange({ ...JOB, salary_min: null, salary_max: null }, es)).toBeNull();
    expect(
      formatSalaryRange(
        {
          ...JOB,
          salary_min: 600000,
          salary_max: 800000,
          salary_currency: "CRC",
          salary_period: "month",
        },
        getCountry("CR"),
      ),
    ).toContain("₡");
  });

  it("el mock de generación usa solo los datos del puesto y no inventa salario", () => {
    const ctx = { country: getCountry("ES"), organizationName: "Logística Demo" };
    const input = jobGenerateV1.input.parse(
      toPromptInput({ ...JOB, salary_min: null, salary_max: null }, ctx.country),
    );
    const output = jobGenerateV1.mock(input, ctx);
    for (const text of [output.internalDescription, ...Object.values(output.offers)]) {
      expect(text).toContain("2 años de experiencia");
      expect(text).not.toMatch(/salari/i);
    }
    expect(output.internalDescription).toContain("Logística Demo");
  });

  it("el system prompt prohíbe inventar datos y pedir el salario anterior", () => {
    const system = jobGenerateV1.system({ country: getCountry("ES"), organizationName: "Demo" });
    expect(system).toMatch(/No inventes salario/);
    expect(system).toMatch(/salario actual o anterior/);
    expect(system).toMatch(/"Demo"/);
  });
});

describe("Markdown", () => {
  it("convierte a texto plano para pegar en LinkedIn", () => {
    expect(
      markdownToPlainText(
        "## Qué harás\n\n- **Coordinar** envíos\n- Ver [web](https://x.com)\n\n\n\nFin",
      ),
    ).toBe("QUÉ HARÁS\n\n• Coordinar envíos\n• Ver web (https://x.com)\n\nFin");
  });

  it("genera nombres de fichero seguros", () => {
    expect(slugForFilename("Técnico/a de logística")).toBe("tecnico-a-de-logistica");
    expect(slugForFilename("¿?")).toBe("documento");
  });
});

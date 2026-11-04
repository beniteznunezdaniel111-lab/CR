import { describe, expect, it } from "vitest";
import { getCountry } from "@/lib/countries";
import { checkInclusiveRules, excerptAppearsIn } from "@/lib/inclusive/rules";
import { buildInclusiveReview, jobNotices } from "@/modules/jobs/inclusive-review";

const check = (text: string, country: "ES" | "CR" = "ES") =>
  checkInclusiveRules([{ field: "internal", text }], country);

const categories = (text: string, country: "ES" | "CR" = "ES") =>
  check(text, country).map((finding) => finding.category);

describe("reglas de lenguaje inclusivo", () => {
  it.each([
    ["Candidatos menores de 30 años.", "age"],
    ["Edad comprendida entre 25 y 35 años.", "age"],
    ["Buscamos un perfil joven y dinámico.", "age"],
    ["Se valorará buena presencia.", "appearance"],
    ["Se requiere nacionalidad española.", "origin_nationality"],
    ["Inglés nativo.", "origin_nationality"],
    ["Preferiblemente soltero y sin cargas familiares.", "family_marital"],
    ["Buscamos mujer para atención al público.", "gender"],
    ["Persona católica practicante.", "religion_beliefs"],
    ["Imprescindible buen estado de salud: perfecto estado de salud.", "health_disability"],
    ["No más de 5 años de experiencia.", "age"],
  ])("señala «%s» (%s)", (text, category) => {
    expect(categories(text)).toContain(category);
  });

  it.each([
    "Entre 2 y 5 años de experiencia en logística.",
    "Entre 10 y 15 años de experiencia en el sector.",
    "Promovemos la igualdad de oportunidades entre mujeres y hombres.",
    "Seleccionamos sin distinción de sexo, religión, estado civil o nacionalidad.",
    "Permiso de trabajo en vigor.",
    "Inglés C1 o nivel bilingüe.",
    "La persona candidata coordinará al equipo.",
  ])("no señala «%s»", (text) => {
    expect(check(text)).toEqual([]);
  });

  it("el historial salarial solo se señala en España (transparencia retributiva UE)", () => {
    const text = "Indica tu salario actual en la candidatura.";
    expect(categories(text, "ES")).toContain("salary_history");
    expect(categories(text, "CR")).not.toContain("salary_history");
  });

  it("señala el masculino genérico con gravedad baja", () => {
    const [finding] = check("El candidato ideal tendrá iniciativa.");
    expect(finding).toMatchObject({ category: "gendered_language", severity: "low" });
  });

  it("devuelve el fragmento literal y no repite hallazgos iguales en el mismo texto", () => {
    const findings = check("Buena presencia. Imprescindible buena presencia.");
    const appearance = findings.filter((finding) => finding.category === "appearance");
    expect(appearance).toHaveLength(1);
    expect(appearance[0]!.excerpt.toLowerCase()).toBe("buena presencia");
  });

  it("distingue el campo de cada hallazgo", () => {
    const findings = checkInclusiveRules(
      [
        { field: "linkedin", text: "Buena presencia." },
        { field: "website", text: "Buena presencia." },
      ],
      "ES",
    );
    expect(findings.map((finding) => finding.field).sort()).toEqual(["linkedin", "website"]);
  });

  it("compara fragmentos sin distinguir mayúsculas ni espacios", () => {
    expect(excerptAppearsIn("buena   PRESENCIA", "Se valora Buena presencia.")).toBe(true);
    expect(excerptAppearsIn("algo inventado", "Se valora buena presencia.")).toBe(false);
    expect(excerptAppearsIn("", "texto")).toBe(false);
  });
});

describe("revisión de un puesto (reglas + IA)", () => {
  const docs = {
    internal: "Buscamos un perfil joven.",
    linkedin: "Únete al equipo.",
    jobBoard: "Requisitos: experiencia en ventas.",
    website: "Ofrecemos flexibilidad.",
  };
  const job = { salary_min: null, salary_max: null };

  it("acepta solo hallazgos de la IA que aparecen en el texto y no duplica los de las reglas", () => {
    const review = buildInclusiveReview({
      docs,
      country: getCountry("ES"),
      job,
      aiFindings: [
        // Duplicado de una regla: se descarta en silencio.
        {
          field: "internal",
          excerpt: "perfil joven",
          category: "age",
          severity: "medium",
          explanation: "x",
          suggestion: "y",
        },
        // Literal y nuevo: se acepta.
        {
          field: "jobBoard",
          excerpt: "experiencia en ventas",
          category: "other",
          severity: "low",
          explanation: "x",
          suggestion: "y",
        },
        // Inventado: se descarta y se cuenta.
        {
          field: "linkedin",
          excerpt: "solo hombres",
          category: "gender",
          severity: "high",
          explanation: "x",
          suggestion: "y",
        },
      ],
      now: new Date("2026-01-01T00:00:00Z"),
    });
    expect(review.aiReviewed).toBe(true);
    expect(review.aiDiscarded).toBe(1);
    expect(review.findings.map((finding) => [finding.source, finding.field])).toEqual([
      ["rules", "internal"],
      ["ai", "jobBoard"],
    ]);
    expect(review.reviewedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("ordena por gravedad", () => {
    const review = buildInclusiveReview({
      docs: { ...docs, linkedin: "El candidato tendrá buena presencia." },
      country: getCountry("ES"),
      job,
      aiFindings: null,
    });
    expect(review.findings.map((finding) => finding.severity)).toEqual(["high", "medium", "low"]);
    expect(review.aiReviewed).toBe(false);
  });

  it("avisa de la banda salarial ausente solo donde hay transparencia retributiva", () => {
    expect(jobNotices(job, getCountry("ES"))).toEqual([
      { code: "missing_salary_range", severity: "medium" },
    ]);
    expect(jobNotices(job, getCountry("CR"))).toEqual([]);
    expect(jobNotices({ salary_min: 20000, salary_max: null }, getCountry("ES"))).toEqual([]);
  });
});

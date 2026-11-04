import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type CvAnalysisOutput, cvAnalysisV1 } from "@/lib/ai/prompts/cv/analysis.v1";
import { cvIdentityV1 } from "@/lib/ai/prompts/cv/identity.v1";
import { getCountry } from "@/lib/countries";
import { PDF_MIME, extractDocumentText } from "@/lib/extraction";
import { type CandidateIdentity, EMPTY_IDENTITY, redactCvText } from "@/lib/privacy/redaction";
import { buildAnalysis, countMatches, type RequirementRef } from "@/modules/candidates/analysis";

const REQUIREMENTS: RequirementRef[] = [
  { id: "r1", text: "Experiencia en gestión de almacén", kind: "required" },
  { id: "r2", text: "Carné de carretillero", kind: "required" },
  { id: "r3", text: "Inglés B2", kind: "preferred" },
];

const CV = [
  "[dato personal omitido]",
  "Técnica de logística",
  "- Experiencia en gestión de almacén con tres turnos",
  "Inglés B2 · Francés A2",
].join("\n");

const output = (overrides: Partial<CvAnalysisOutput> = {}): CvAnalysisOutput => ({
  summary: "Perfil con experiencia en logística y almacén.",
  profile: {
    headline: "Técnica de logística",
    experience: [],
    education: [],
    skills: ["SAP"],
    languages: [{ language: "Inglés", level: "B2" }],
    certifications: [],
  },
  requirements: [
    {
      requirementId: "r1",
      result: "meets",
      evidence: "Experiencia en gestión de almacén con tres turnos",
      explanation: "Lo indica en su experiencia.",
    },
    {
      requirementId: "r3",
      result: "meets",
      evidence: "Inglés C1 certificado",
      explanation: "Declara el idioma.",
    },
  ],
  interviewQuestions: [
    { question: "¿Has manejado carretillas?", purpose: "Aclarar r2", requirementId: "r2" },
  ],
  ...overrides,
});

const build = (out: CvAnalysisOutput, identity: CandidateIdentity = EMPTY_IDENTITY) =>
  buildAnalysis({
    output: out,
    requirements: REQUIREMENTS,
    redactedText: CV,
    identity,
    country: "ES",
  });

describe("salvaguardas del análisis de CVs", () => {
  it("verifica cada cita contra el CV y solo cuenta «cumple» con cita literal", () => {
    const analysis = build(output());
    const [r1, r2, r3] = analysis.matches;
    expect(r1).toMatchObject({ result: "meets", evidenceVerified: true, notEvaluated: false });
    // La IA citó algo que no está en el CV: no se cuenta como cumplido.
    expect(r3).toMatchObject({ result: "meets", evidenceVerified: false });
    expect(analysis.counts).toEqual({
      requiredMet: 1,
      requiredTotal: 2,
      preferredMet: 0,
      preferredTotal: 1,
    });
    // Requisito que la IA no devolvió: no consta y se indica.
    expect(r2).toMatchObject({ result: "not_found", evidence: null, notEvaluated: true });
  });

  it("ignora ids que no son requisitos del puesto y duplicados", () => {
    const analysis = build(
      output({
        requirements: [
          { requirementId: "inventado", result: "meets", evidence: "x", explanation: "x" },
          { requirementId: "r2", result: "not_found", evidence: "algo", explanation: "No consta." },
          { requirementId: "r2", result: "meets", evidence: "otra", explanation: "Duplicado." },
        ],
      }),
    );
    expect(analysis.matches.map((match) => match.requirementId)).toEqual(["r1", "r2", "r3"]);
    // Con "no consta" nunca se guarda cita.
    expect(analysis.matches[1]).toMatchObject({ result: "not_found", evidence: null });
  });

  it("retira menciones a atributos protegidos y registra la salvaguarda sin el texto", () => {
    const analysis = build(
      output({
        summary: "Tiene experiencia en almacén. Es una persona joven. Domina SAP.",
        interviewQuestions: [
          { question: "¿Tienes hijos?", purpose: "Disponibilidad", requirementId: null },
          {
            question: "¿Qué sistema de almacén usaste?",
            purpose: "Profundizar",
            requirementId: "r1",
          },
        ],
        profile: { ...output().profile, skills: ["SAP", "Afiliación sindical"] },
      }),
    );
    expect(analysis.summary).toBe("Tiene experiencia en almacén. Domina SAP.");
    expect(analysis.questions.map((question) => question.question)).toEqual([
      "¿Qué sistema de almacén usaste?",
    ]);
    expect(analysis.profile.skills).toEqual(["SAP"]);
    expect(analysis.guardFlags).toEqual(
      expect.arrayContaining([
        { field: "summary", category: "age" },
        { field: "question", category: "family_marital" },
        { field: "profile", category: "religion_beliefs" },
      ]),
    );
    expect(JSON.stringify(analysis.guardFlags)).not.toMatch(/joven|hijos/);
  });

  it("vuelve a ocultar el nombre si la IA lo menciona", () => {
    const analysis = build(output({ summary: "Ana Martín tiene experiencia en almacén." }), {
      ...EMPTY_IDENTITY,
      fullName: "Ana Martín",
    });
    expect(analysis.summary).not.toMatch(/Ana|Martín/);
  });

  it("el recuento no depende de la IA: es determinista", () => {
    expect(
      countMatches([
        { requirementKind: "required", result: "meets", evidenceVerified: true },
        { requirementKind: "required", result: "partial", evidenceVerified: true },
        { requirementKind: "preferred", result: "meets", evidenceVerified: true },
      ]),
    ).toEqual({ requiredMet: 1, requiredTotal: 2, preferredMet: 1, preferredTotal: 1 });
  });
});

describe("flujo completo con el proveedor simulado", () => {
  it("PDF → identidad → anonimización → análisis, sin datos personales en la salida", async () => {
    const pdf = new Uint8Array(
      readFileSync(join(import.meta.dirname, "..", "..", "fixtures", "cvs", "cv-ana-martin.pdf")),
    );
    const { text } = await extractDocumentText(pdf, PDF_MIME);
    const ctx = { country: getCountry("ES"), organizationName: "Demo" };

    const identity = cvIdentityV1.output.parse(cvIdentityV1.mock({ cvText: text }, ctx));
    expect(identity.fullName).toBe("Ana Martín Ruiz");

    const redacted = redactCvText(text, identity).text;
    const input = cvAnalysisV1.input.parse({
      job: {
        title: "Técnico/a de logística",
        level: "mid",
        responsibilities: "Coordinar envíos",
        requirements: REQUIREMENTS,
      },
      cvText: redacted,
    });
    const raw = cvAnalysisV1.output.parse(cvAnalysisV1.mock(input, ctx));
    const analysis = buildAnalysis({
      output: raw,
      requirements: REQUIREMENTS,
      redactedText: redacted,
      identity,
      country: "ES",
    });

    expect(analysis.matches.map((match) => [match.result, match.evidenceVerified])).toEqual([
      ["meets", true],
      ["not_found", false],
      ["meets", true],
    ]);
    expect(analysis.counts.requiredMet).toBe(1);
    const serialized = JSON.stringify(analysis);
    for (const secret of ["Ana", "Martín", "example.com", "612", "1990", "española", "casada"]) {
      expect(serialized, secret).not.toContain(secret);
    }
    expect(analysis.guardFlags).toEqual([]);
    // Trato de tú en España.
    expect(analysis.questions[0]?.question).toMatch(/^¿Puedes/);
  });
});

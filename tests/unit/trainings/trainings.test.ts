import { describe, expect, it } from "vitest";
import { createTrainingSchema, quizSchema } from "@/modules/trainings/schemas";
import { buildSourceText, defaultTrainingTitle } from "@/modules/trainings/sources";

const ORG = "00000000-0000-4000-8000-00000000000a";
const TRAINING = "00000000-0000-4000-8000-00000000000b";

describe("buildSourceText", () => {
  it("reparte el máximo para que ningún documento se quede fuera", () => {
    const text = buildSourceText(
      [
        { title: "Largo", content: "a".repeat(10_000) },
        { title: "Corto", content: "Texto breve." },
      ],
      1_000,
    )!;
    expect(text).toContain("### Corto\nTexto breve.");
    expect(text).toContain("### Largo\naaa");
    expect(text.length).toBeLessThanOrEqual(1_000);
  });

  it("sin texto devuelve null", () => {
    expect(buildSourceText([{ title: "Vacío", content: "   " }])).toBeNull();
    expect(buildSourceText([])).toBeNull();
  });
});

describe("defaultTrainingTitle", () => {
  it("usa el título indicado, si no la primera línea del tema y si no el genérico", () => {
    expect(defaultTrainingTitle("Mi formación", "Tema", "Nueva")).toBe("Mi formación");
    expect(defaultTrainingTitle(undefined, "Protección de datos\nDetalles", "Nueva")).toBe(
      "Protección de datos",
    );
    expect(defaultTrainingTitle(undefined, undefined, "Nueva formación")).toBe("Nueva formación");
  });
});

describe("createTrainingSchema", () => {
  const base = { orgId: ORG, moduleCount: 4, questionCount: 8 };

  it("exige un tema, documentos de la FAQ o ficheros", () => {
    const result = createTrainingSchema.safeParse(base);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ message: "trainingSource", path: ["topic"] });
    expect(createTrainingSchema.safeParse({ ...base, topic: "Igualdad" }).success).toBe(true);
    expect(createTrainingSchema.safeParse({ ...base, kbDocumentIds: [TRAINING] }).success).toBe(
      true,
    );
  });

  it("limita módulos (2-8) y preguntas (3-15)", () => {
    expect(createTrainingSchema.safeParse({ ...base, topic: "x", moduleCount: 9 }).success).toBe(
      false,
    );
    expect(createTrainingSchema.safeParse({ ...base, topic: "x", questionCount: 2 }).success).toBe(
      false,
    );
  });
});

describe("quizSchema", () => {
  const question = {
    question: "¿Cuántos días de vacaciones hay?",
    options: ["15", "23"],
    correctIndex: 1,
    explanation: "Son 23 días laborables.",
  };

  it("acepta un test válido", () => {
    expect(
      quizSchema.safeParse({ orgId: ORG, trainingId: TRAINING, questions: [question] }).success,
    ).toBe(true);
  });

  it("la respuesta correcta tiene que ser una de las opciones y las opciones distintas", () => {
    const wrongIndex = quizSchema.safeParse({
      orgId: ORG,
      trainingId: TRAINING,
      questions: [{ ...question, correctIndex: 2 }],
    });
    expect(wrongIndex.error?.issues.map((issue) => issue.message)).toContain("quizCorrect");
    const repeated = quizSchema.safeParse({
      orgId: ORG,
      trainingId: TRAINING,
      questions: [{ ...question, options: ["Sí", "sí"] }],
    });
    expect(repeated.error?.issues.map((issue) => issue.message)).toContain("quizOptions");
  });
});

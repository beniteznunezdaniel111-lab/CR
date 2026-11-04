import { describe, expect, it } from "vitest";
import { type InterviewGuideOutput, interviewGuideV1 } from "@/lib/ai/prompts/interviews/guide.v1";
import { onboardingPlanV1 } from "@/lib/ai/prompts/onboarding/plan.v1";
import { getCountry } from "@/lib/countries";
import { countQuestions, sanitizeGuide } from "@/modules/interviews/guide";
import {
  clampDay,
  dueDate,
  isOverdue,
  phaseOfDay,
  progressOf,
  tasksFromAi,
} from "@/modules/onboarding/plan";

const guide = (overrides: Partial<InterviewGuideOutput> = {}): InterviewGuideOutput => ({
  intro: "Sigue el orden de la guía. No preguntes por la edad.",
  competencies: [
    {
      competency: "Organización",
      questions: [
        { question: "¿Cómo priorizas tu trabajo?", lookFor: ["Método concreto"] },
        { question: "¿Tienes hijos que cuidar?", lookFor: ["Disponibilidad"] },
      ],
    },
    {
      competency: "Estado civil",
      questions: [{ question: "¿Estás casada?", lookFor: ["x"] }],
    },
  ],
  technical: [
    { question: "¿Qué SGA has usado?", lookFor: ["Nombre de sistemas"], requirementId: "r1" },
    { question: "¿Qué sabes de inventarios?", lookFor: ["Ejemplos"], requirementId: "inventado" },
  ],
  behavioral: [
    {
      question: "Cuéntame una situación difícil con un proveedor.",
      competency: "Negociación",
      lookFor: ["STAR completo"],
    },
  ],
  candidateFocus: [
    { question: "¿Cuál es tu salario actual?", lookFor: ["Cifra"], requirementId: null },
  ],
  rubric: [
    { criterion: "Experiencia", levels: ["1", "2", "3", "4", "5"] },
    { criterion: "Buena presencia", levels: ["1", "2", "3", "4", "5"] },
  ],
  ...overrides,
});

describe("salvaguardas de la guía de entrevista", () => {
  it("retira preguntas personales, criterios sobre rasgos y el salario anterior (España)", () => {
    const { content, guardFlags } = sanitizeGuide(guide(), {
      country: "ES",
      requirementIds: ["r1"],
    });
    expect(content.competencies).toEqual([
      {
        competency: "Organización",
        questions: [{ question: "¿Cómo priorizas tu trabajo?", lookFor: ["Método concreto"] }],
      },
    ]);
    expect(content.candidateFocus).toEqual([]);
    expect(content.rubric.map((item) => item.criterion)).toEqual(["Experiencia"]);
    expect(content.intro).toBe("Sigue el orden de la guía.");
    expect(guardFlags).toEqual(
      expect.arrayContaining([
        { section: "competencies", category: "family_marital" },
        { section: "candidateFocus", category: "salary_history" },
        { section: "rubric", category: "appearance" },
        { section: "intro", category: "age" },
      ]),
    );
    expect(countQuestions(content)).toBe(4);
  });

  it("descarta referencias a requisitos que no son del puesto", () => {
    const { content } = sanitizeGuide(guide(), { country: "ES", requirementIds: ["r1"] });
    expect(content.technical.map((item) => item.requirementId)).toEqual(["r1", null]);
  });

  it("en Costa Rica no se vigila el historial salarial", () => {
    const { content } = sanitizeGuide(guide(), { country: "CR", requirementIds: [] });
    expect(content.candidateFocus).toHaveLength(1);
  });

  it("el mock adapta la guía a la candidatura y trata de usted en Costa Rica", () => {
    const input = interviewGuideV1.input.parse({
      job: {
        title: "Técnico/a de logística",
        level: "mid",
        responsibilities: "Coordinar envíos",
        requirements: [{ id: "r1", text: "Carné de carretillero", kind: "required" }],
      },
      candidate: {
        summary: "",
        gaps: [
          {
            requirementId: "r1",
            requirement: "Carné de carretillero",
            result: "not_found",
            note: "",
          },
        ],
      },
    });
    const cr = interviewGuideV1.mock(input, {
      country: getCountry("CR"),
      organizationName: "Demo",
    });
    expect(cr.candidateFocus[0]?.question).toMatch(/^¿Qué experiencia tiene/);
    expect(cr.rubric[0]?.levels).toHaveLength(5);
    const es = interviewGuideV1.mock(
      { ...input, candidate: null },
      { country: getCountry("ES"), organizationName: "Demo" },
    );
    expect(es.candidateFocus).toEqual([]);
    expect(es.technical[0]?.question).toMatch(/^Cuéntame/);
  });
});

describe("planes de onboarding", () => {
  it("las tareas de la IA se ajustan a su fase y se ordenan por día", () => {
    const tasks = tasksFromAi([
      {
        phase: "d60",
        title: " Revisión ",
        description: "",
        owner: "RRHH",
        materials: "",
        isCheckpoint: true,
        dueDay: 90,
      },
      {
        phase: "d30",
        title: "Bienvenida",
        description: "",
        owner: "RRHH",
        materials: "",
        isCheckpoint: false,
        dueDay: 1,
      },
    ]);
    expect(tasks.map((task) => [task.title, task.phase, task.due_day])).toEqual([
      ["Bienvenida", "d30", 1],
      ["Revisión", "d60", 60],
    ]);
  });

  it("calcula fases, fechas, progreso y retrasos", () => {
    expect([phaseOfDay(1), phaseOfDay(30), phaseOfDay(31), phaseOfDay(90)]).toEqual([
      "d30",
      "d30",
      "d60",
      "d90",
    ]);
    expect(clampDay("d90", 10)).toBe(61);
    expect(dueDate("2026-12-01", 1)).toBe("2026-12-01");
    expect(dueDate("2026-12-01", 90)).toBe("2027-02-28");
    expect(
      progressOf([{ completed_at: "x" }, { completed_at: null }, { completed_at: null }]),
    ).toEqual({ done: 1, total: 3, percent: 33 });
    expect(isOverdue({ due_date: "2026-11-01", completed_at: null }, "2026-11-04")).toBe(true);
    expect(isOverdue({ due_date: "2026-11-01", completed_at: "x" }, "2026-11-04")).toBe(false);
  });

  it("el mock genera un plan válido con un checkpoint al final de cada fase", () => {
    const input = onboardingPlanV1.input.parse({
      title: "Técnico/a de logística",
      level: "mid",
      department: null,
      workMode: "onsite",
      location: null,
      responsibilities: "Coordinar envíos\nGestionar el almacén",
      requirements: [],
    });
    const output = onboardingPlanV1.output.parse(
      onboardingPlanV1.mock(input, { country: getCountry("ES"), organizationName: "Demo" }),
    );
    const checkpoints = output.tasks.filter((task) => task.isCheckpoint).map((task) => task.dueDay);
    expect(checkpoints).toEqual([30, 60, 90]);
  });
});

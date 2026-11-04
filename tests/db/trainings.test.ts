/**
 * Fase 5 · Formación y evaluaciones: visibilidad por asignación, respuestas
 * secretas, nota calculada en la base de datos (70 %, mejor nota), bloqueo del
 * test con intentos, duplicado, avisos y aislamiento entre empresas.
 */
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Org,
  type TestUser,
  connect,
  createOrganization,
  createUser,
  exec,
  inviteAndAccept,
  query,
} from "./helpers";

let db: Client;
let orgA: Org;
let orgB: Org;
const u = {} as Record<"aAdmin" | "aHr" | "aEmp" | "aEmp2" | "bAdmin" | "bEmp", TestUser>;

const QUIZ = [
  {
    question: "¿Cuántos días de vacaciones hay al año?",
    options: ["15 días", "23 días laborables", "30 días naturales"],
    correct_index: 1,
    explanation: "La política fija 23 días laborables.",
  },
  {
    question: "¿Con cuánta antelación se piden?",
    options: ["Quince días", "Un día"],
    correct_index: 0,
    explanation: "Se solicitan con quince días de antelación.",
  },
];

async function createTraining(user: TestUser, org: Org, title: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    db,
    user,
    "insert into public.trainings (org_id, title, description) values ($1, $2, 'Formación de prueba') returning id",
    [org.id, title],
  );
  return row!.id;
}

async function addModule(
  user: TestUser,
  org: Org,
  trainingId: string,
  position: number,
  content: string,
) {
  const [row] = await query<{ id: string }>(
    db,
    user,
    `insert into public.training_modules (org_id, training_id, position, title, content)
     values ($1, $2, $3, $4, $5) returning id`,
    [org.id, trainingId, position, `Módulo ${position}`, content],
  );
  return row!.id;
}

const saveQuiz = (user: TestUser, trainingId: string, questions: unknown) =>
  query(db, user, "select public.save_training_quiz($1, $2)", [
    trainingId,
    JSON.stringify(questions),
  ]);

const publish = (user: TestUser, trainingId: string) =>
  query(db, user, "select public.publish_training($1)", [trainingId]);

const assign = async (
  user: TestUser,
  trainingId: string,
  users: TestUser[],
  due: string | null = null,
) => {
  const [row] = await query<{ n: number }>(
    db,
    user,
    "select public.assign_training($1, $2, $3) as n",
    [trainingId, users.map((item) => item.id), due],
  );
  return row!.n;
};

const submit = async (user: TestUser | "service_role", assignmentId: string, answers: number[]) => {
  const [row] = await query<{ result: Record<string, unknown> }>(
    db,
    user,
    "select public.submit_training_attempt($1, $2) as result",
    [assignmentId, answers],
  );
  return row!.result;
};

async function assignmentOf(user: TestUser, trainingId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "select id from public.training_assignments where training_id = $1 and user_id = $2",
    [trainingId, user.id],
  );
  return rows[0]!.id;
}

let trainingId: string;
let moduleIds: string[];

beforeAll(async () => {
  db = await connect();
  for (const label of ["aAdmin", "aHr", "aEmp", "aEmp2", "bAdmin", "bEmp"] as const) {
    u[label] = await createUser(db, label);
  }
  orgA = await createOrganization(db, u.aAdmin, "Formación Alfa", "ES");
  orgB = await createOrganization(db, u.bAdmin, "Formación Beta", "CR");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aHr, "hr");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aEmp, "employee");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aEmp2, "employee");
  await inviteAndAccept(db, u.bAdmin, orgB, u.bEmp, "employee");

  trainingId = await createTraining(u.aHr, orgA, "Vacaciones y permisos");
  moduleIds = [
    await addModule(u.aHr, orgA, trainingId, 1, "## Vacaciones\nSon 23 días laborables."),
    await addModule(u.aHr, orgA, trainingId, 2, ""),
  ];
});

afterAll(async () => {
  for (const org of [orgA, orgB]) {
    if (org) await db.query("delete from public.organizations where id = $1", [org.id]);
  }
  await db?.end();
});

describe("crear, completar y publicar", () => {
  it("solo RRHH crea formaciones y la plantilla no ve los borradores", async () => {
    await expect(createTraining(u.aEmp, orgA, "Intrusa")).rejects.toThrow(/row-level security/);
    await expect(createTraining(u.aHr, orgB, "En otra empresa")).rejects.toThrow(
      /row-level security/,
    );
    const visible = await query(db, u.aEmp, "select id from public.trainings where id = $1", [
      trainingId,
    ]);
    expect(visible).toHaveLength(0);
  });

  it("publicar exige módulos con contenido y un test con respuestas", async () => {
    await expect(publish(u.aHr, trainingId)).rejects.toThrow(
      /Todos los módulos necesitan contenido/,
    );
    await exec(db, u.aHr, "update public.training_modules set content = $2 where id = $1", [
      moduleIds[1],
      "## Permisos\nPor mudanza, un día.",
    ]);
    await expect(publish(u.aHr, trainingId)).rejects.toThrow(/El test necesita preguntas/);
  });

  it("el test se guarda solo con datos válidos y solo lo guarda RRHH", async () => {
    await expect(saveQuiz(u.aEmp, trainingId, QUIZ)).rejects.toThrow(/Formación no encontrada/);
    await expect(saveQuiz(u.aHr, trainingId, [{ ...QUIZ[0], correct_index: 3 }])).rejects.toThrow(
      /marca la respuesta correcta/,
    );
    await expect(
      saveQuiz(u.aHr, trainingId, [{ ...QUIZ[0], options: ["Igual", "igual"] }]),
    ).rejects.toThrow(/opciones distintas/);
    await expect(saveQuiz(u.aHr, trainingId, [])).rejects.toThrow(/entre 1 y 30 preguntas/);
    await saveQuiz(u.aHr, trainingId, QUIZ);
    const [keys] = await query<{ n: number }>(
      db,
      u.aHr,
      "select count(*)::int as n from public.training_quiz_keys k join public.training_quiz_questions q on q.id = k.question_id where q.training_id = $1",
      [trainingId],
    );
    expect(keys!.n).toBe(2);
  });

  it("solo RRHH publica, y el estado no se puede cambiar a mano", async () => {
    await expect(publish(u.aEmp, trainingId)).rejects.toThrow(/Formación no encontrada/);
    await expect(
      exec(db, u.aHr, "update public.trainings set status = 'published' where id = $1", [
        trainingId,
      ]),
    ).rejects.toThrow(/permission denied/);
    await publish(u.aHr, trainingId);
    const [row] = await query<{ status: string }>(
      db,
      u.aHr,
      "select status from public.trainings where id = $1",
      [trainingId],
    );
    expect(row!.status).toBe("published");
    const audit = await query(
      db,
      u.aAdmin,
      "select 1 from public.audit_events where action = 'training.published' and entity_id = $1",
      [trainingId],
    );
    expect(audit).toHaveLength(1);
  });
});

describe("asignaciones y avisos", () => {
  it("solo se asigna a miembros activos de la empresa, nunca con fecha pasada", async () => {
    await expect(assign(u.aEmp, trainingId, [u.aEmp])).rejects.toThrow(/Formación no encontrada/);
    await expect(assign(u.bAdmin, trainingId, [u.bEmp])).rejects.toThrow(/Formación no encontrada/);
    await expect(assign(u.aHr, trainingId, [u.bEmp])).rejects.toThrow(/miembros activos/);
    await expect(assign(u.aHr, trainingId, [u.aEmp], "2020-01-01")).rejects.toThrow(
      /anterior a hoy/,
    );
  });

  it("una formación en borrador no se asigna", async () => {
    const draft = await createTraining(u.aHr, orgA, "Borrador");
    await expect(assign(u.aHr, draft, [u.aEmp])).rejects.toThrow(/Publica la formación/);
    await exec(db, u.aHr, "delete from public.trainings where id = $1", [draft]);
  });

  it("asignar avisa a cada persona nueva; reasignar solo cambia la fecha límite", async () => {
    expect(await assign(u.aHr, trainingId, [u.aEmp, u.aEmp2, u.aEmp])).toBe(2);
    const notices = await query<{ params: { title: string }; link: string }>(
      db,
      u.aEmp,
      "select params, link from public.notifications where kind = 'training_assigned'",
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]!.params.title).toBe("Vacaciones y permisos");
    expect(notices[0]!.link).toBe(
      `/app/${orgA.slug}/my-trainings/${await assignmentOf(u.aEmp, trainingId)}`,
    );

    expect(await assign(u.aHr, trainingId, [u.aEmp], "2099-12-31")).toBe(0);
    const [row] = await query<{ due: string }>(
      db,
      u.aEmp,
      "select due_date::text as due from public.training_assignments where training_id = $1",
      [trainingId],
    );
    expect(row!.due).toBe("2099-12-31");
  });
});

describe("lo que ve la plantilla", () => {
  it("ve la formación, los módulos y las preguntas asignadas, pero nunca las respuestas", async () => {
    const counts = async (user: TestUser) => {
      const [row] = await query<{ t: number; m: number; q: number; k: number }>(
        db,
        user,
        `select (select count(*) from public.trainings where id = $1)::int as t,
                (select count(*) from public.training_modules where training_id = $1)::int as m,
                (select count(*) from public.training_quiz_questions where training_id = $1)::int as q,
                (select count(*) from public.training_quiz_keys)::int as k`,
        [trainingId],
      );
      return row;
    };
    expect(await counts(u.aEmp)).toEqual({ t: 1, m: 2, q: 2, k: 0 });
    expect(await counts(u.aHr)).toEqual({ t: 1, m: 2, q: 2, k: 2 });
    expect(await counts(u.bEmp)).toEqual({ t: 0, m: 0, q: 0, k: 0 });
    // Las fuentes de generación son solo de RRHH.
    expect(await query(db, u.aEmp, "select 1 from public.training_sources")).toHaveLength(0);
  });

  it("marca módulos como completados solo en su propia asignación", async () => {
    const own = await assignmentOf(u.aEmp, trainingId);
    const insert = (user: TestUser, assignmentId: string, moduleId: string) =>
      exec(
        db,
        user,
        "insert into public.training_module_progress (assignment_id, module_id, org_id) values ($1, $2, $3)",
        [assignmentId, moduleId, orgA.id],
      );
    expect(await insert(u.aEmp, own, moduleIds[0]!)).toBe(1);
    await expect(insert(u.aEmp2, own, moduleIds[1]!)).rejects.toThrow(/row-level security/);
    const other = await createTraining(u.aHr, orgA, "Otra");
    const foreignModule = await addModule(u.aHr, orgA, other, 1, "x");
    await expect(insert(u.aEmp, own, foreignModule)).rejects.toThrow(/row-level security/);
  });
});

describe("intentos del test", () => {
  it("la nota se calcula en la base de datos, se guarda la mejor y se aprueba con 70 %", async () => {
    const own = await assignmentOf(u.aEmp, trainingId);

    const failed = await submit(u.aEmp, own, [0, 1]);
    expect(failed).toMatchObject({ score: 0, passed: false, correct: 0, total: 2, best_score: 0 });
    expect(failed.results).toEqual([
      expect.objectContaining({ selected: 0, correct_index: 1, correct: false }),
      expect.objectContaining({ selected: 1, correct_index: 0, correct: false }),
    ]);

    expect(await submit(u.aEmp, own, [1, 0])).toMatchObject({ score: 100, passed: true });
    expect(await submit(u.aEmp, own, [1, 1])).toMatchObject({
      score: 50,
      passed: false,
      best_score: 100,
    });

    const [assignment] = await query<{ attempt_count: number; best: string; passed: boolean }>(
      db,
      u.aEmp,
      "select attempt_count, best_score::text as best, passed_at is not null as passed from public.training_assignments where id = $1",
      [own],
    );
    expect(assignment).toEqual({ attempt_count: 3, best: "100.00", passed: true });
  });

  it("rechaza respuestas incompletas o fuera de rango", async () => {
    const own = await assignmentOf(u.aEmp, trainingId);
    await expect(submit(u.aEmp, own, [1])).rejects.toThrow(/Responde todas las preguntas/);
    await expect(submit(u.aEmp, own, [1, 5])).rejects.toThrow(/Respuesta no válida/);
  });

  it("nadie más puede entregar un intento en tu nombre ni tocar la nota", async () => {
    const own = await assignmentOf(u.aEmp, trainingId);
    await expect(submit(u.aEmp2, own, [1, 0])).rejects.toThrow(/Asignación no encontrada/);
    await expect(submit(u.aHr, own, [1, 0])).rejects.toThrow(/Asignación no encontrada/);
    await expect(submit("service_role", own, [1, 0])).rejects.toThrow(/permission denied/);
    await expect(
      exec(db, u.aEmp, "update public.training_assignments set best_score = 100 where id = $1", [
        own,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(
        db,
        u.aEmp,
        `insert into public.training_attempts (org_id, assignment_id, training_id, user_id, answers, correct_count, total, score, passed)
         values ($1, $2, $3, $4, '{1,0}', 2, 2, 100, true)`,
        [orgA.id, own, trainingId, u.aEmp.id],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("cada persona ve sus intentos; RRHH los de la empresa", async () => {
    const count = async (user: TestUser) =>
      (
        await query(db, user, "select 1 from public.training_attempts where training_id = $1", [
          trainingId,
        ])
      ).length;
    expect(await count(u.aEmp)).toBe(3);
    expect(await count(u.aEmp2)).toBe(0);
    expect(await count(u.aHr)).toBe(3);
    expect(await count(u.bAdmin)).toBe(0);
  });
});

describe("un test con intentos no se edita: se duplica", () => {
  it("no se puede cambiar el test ni borrar la formación", async () => {
    await expect(saveQuiz(u.aHr, trainingId, QUIZ)).rejects.toThrow(/ya tiene intentos/);
    await expect(
      exec(db, u.aHr, "delete from public.trainings where id = $1", [trainingId]),
    ).rejects.toThrow(/tiene intentos/);
  });

  it("la copia es un borrador con los módulos y el test, y se puede editar", async () => {
    await expect(
      query(db, u.aEmp, "select public.duplicate_training($1, 'Copia')", [trainingId]),
    ).rejects.toThrow(/Formación no encontrada/);
    const [row] = await query<{ id: string }>(
      db,
      u.aHr,
      "select public.duplicate_training($1, 'Vacaciones y permisos (copia)') as id",
      [trainingId],
    );
    const copy = row!.id;
    const [info] = await query<{ status: string; duplicated_from: string; m: number; k: number }>(
      db,
      u.aHr,
      `select t.status, t.duplicated_from,
              (select count(*) from public.training_modules where training_id = t.id)::int as m,
              (select count(*) from public.training_quiz_keys k join public.training_quiz_questions q on q.id = k.question_id where q.training_id = t.id)::int as k
       from public.trainings t where t.id = $1`,
      [copy],
    );
    expect(info).toEqual({ status: "draft", duplicated_from: trainingId, m: 2, k: 2 });
    await saveQuiz(u.aHr, copy, [QUIZ[0]]);
    expect(await exec(db, u.aHr, "delete from public.trainings where id = $1", [copy])).toBe(1);
  });

  it("una asignación solo se puede quitar mientras no tenga intentos", async () => {
    const withAttempts = await assignmentOf(u.aEmp, trainingId);
    const withoutAttempts = await assignmentOf(u.aEmp2, trainingId);
    expect(
      await exec(db, u.aHr, "delete from public.training_assignments where id = $1", [
        withAttempts,
      ]),
    ).toBe(0);
    expect(
      await exec(db, u.aHr, "delete from public.training_assignments where id = $1", [
        withoutAttempts,
      ]),
    ).toBe(1);
  });
});

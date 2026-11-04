/**
 * Fase 3 · Guías de entrevista y onboarding: aislamiento, inmutabilidad de las
 * guías, copia de tareas al asignar y autoría de las tareas completadas.
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
const u = {} as Record<"aAdmin" | "aHr" | "aEmp" | "bAdmin" | "bHr", TestUser>;
let jobA: string;

const TASKS = [
  {
    phase: "d30",
    title: "Bienvenida y presentación del equipo",
    owner_label: "RRHH",
    due_day: 1,
    is_checkpoint: false,
  },
  {
    phase: "d30",
    title: "Revisión del primer mes",
    owner_label: "Responsable",
    due_day: 30,
    is_checkpoint: true,
  },
  { phase: "d90", title: "Evaluación final del periodo", owner_label: "Responsable", due_day: 90 },
];

async function createJob(user: TestUser, org: Org): Promise<string> {
  const [row] = await query<{ id: string }>(
    db,
    user,
    "select public.save_job_position($1, $2, $3) as id",
    [
      org.id,
      JSON.stringify({
        title: "Técnico/a de logística",
        level: "mid",
        work_mode: "onsite",
        responsibilities: "Coordinar envíos y gestionar el almacén.",
        tone: "professional",
      }),
      JSON.stringify([{ text: "Experiencia en almacén", kind: "required" }]),
    ],
  );
  return row!.id;
}

async function savePlan(user: TestUser, org: Org, jobId: string, planId: string | null = null) {
  const [row] = await query<{ id: string }>(
    db,
    user,
    "select public.save_onboarding_plan($1, $2, $3, $4, $5, $6) as id",
    [org.id, jobId, "Plan de incorporación", "Primeros 90 días", JSON.stringify(TASKS), planId],
  );
  return row!.id;
}

async function insertGuide(user: TestUser, org: Org, jobId: string, candidateId: string | null) {
  const [row] = await query<{ id: string }>(
    db,
    user,
    `insert into public.interview_guides (org_id, job_id, candidate_id, content, prompt_id, prompt_version, model)
     values ($1, $2, $3, '{"intro":"x"}', 'interview.guide', 1, 'claude-haiku-5-5') returning id`,
    [org.id, jobId, candidateId],
  );
  return row!.id;
}

beforeAll(async () => {
  db = await connect();
  for (const label of ["aAdmin", "aHr", "aEmp", "bAdmin", "bHr"] as const) {
    u[label] = await createUser(db, label);
  }
  orgA = await createOrganization(db, u.aAdmin, "Onboarding Alfa", "ES");
  orgB = await createOrganization(db, u.bAdmin, "Onboarding Beta", "CR");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aHr, "hr");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aEmp, "employee");
  await inviteAndAccept(db, u.bAdmin, orgB, u.bHr, "hr");
  jobA = await createJob(u.aHr, orgA);
});

afterAll(async () => {
  for (const org of [orgA, orgB]) {
    if (org) await db.query("delete from public.organizations where id = $1", [org.id]);
  }
  await db?.end();
});

describe("guías de entrevista", () => {
  it("son inmutables: no se editan ni se borran directamente", async () => {
    const guideId = await insertGuide(u.aHr, orgA, jobA, null);
    await expect(
      exec(db, u.aHr, "update public.interview_guides set content = '{}' where id = $1", [guideId]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(db, u.aHr, "delete from public.interview_guides where id = $1", [guideId]),
    ).rejects.toThrow(/permission denied/);
  });

  it("una guía para una candidatura exige que sea del mismo puesto", async () => {
    const [candidate] = await query<{ candidate_id: string }>(
      db,
      u.aHr,
      "select candidate_id from public.register_candidates($1, $2)",
      [jobA, JSON.stringify([{ filename: "cv.pdf", mime: "application/pdf", size: 1000 }])],
    );
    const otherJob = await createJob(u.aHr, orgA);
    await expect(insertGuide(u.aHr, orgA, otherJob, candidate!.candidate_id)).rejects.toThrow(
      /no pertenece a este puesto/,
    );
    const guideId = await insertGuide(u.aHr, orgA, jobA, candidate!.candidate_id);

    // Al borrar la candidatura (p. ej. por retención) se borra su guía.
    await exec(db, u.aHr, "delete from public.candidates where id = $1", [candidate!.candidate_id]);
    const { rows } = await db.query("select 1 from public.interview_guides where id = $1", [
      guideId,
    ]);
    expect(rows).toEqual([]);
  });

  it("otra empresa y los empleados no las ven ni pueden crearlas", async () => {
    await insertGuide(u.aHr, orgA, jobA, null);
    for (const user of [u.aEmp, u.bHr]) {
      const rows = await query(
        db,
        user,
        "select id from public.interview_guides where org_id = $1",
        [orgA.id],
      );
      expect(rows, user.label).toEqual([]);
    }
    await expect(insertGuide(u.bHr, orgA, jobA, null)).rejects.toThrow(/row-level security/);
    // Ni colgarla de un puesto de otra empresa con su propia empresa.
    await expect(insertGuide(u.bHr, orgB, jobA, null)).rejects.toThrow(/foreign key/);
  });
});

describe("planes de onboarding", () => {
  it("se guardan con sus tareas y se pueden reescribir", async () => {
    const planId = await savePlan(u.aHr, orgA, jobA);
    const tasks = await query<{ title: string; sort_order: number }>(
      db,
      u.aHr,
      "select title, sort_order from public.onboarding_plan_tasks where plan_id = $1 order by sort_order",
      [planId],
    );
    expect(tasks.map((task) => task.title)).toEqual(TASKS.map((task) => task.title));
    await savePlan(u.aHr, orgA, jobA, planId);
    const [{ n }] = (await query<{ n: number }>(
      db,
      u.aHr,
      "select count(*)::int as n from public.onboarding_plan_tasks where plan_id = $1",
      [planId],
    )) as [{ n: number }];
    expect(n).toBe(TASKS.length);
  });

  it("valida las tareas (fase, día 1-90 y entre 1 y 60)", async () => {
    await expect(
      query(db, u.aHr, "select public.save_onboarding_plan($1, $2, 'Plan', '', '[]')", [
        orgA.id,
        jobA,
      ]),
    ).rejects.toThrow(/entre 1 y 60/);
    await expect(
      query(db, u.aHr, "select public.save_onboarding_plan($1, $2, 'Plan', '', $3)", [
        orgA.id,
        jobA,
        JSON.stringify([{ phase: "d30", title: "Tarea", due_day: 120 }]),
      ]),
    ).rejects.toThrow(/check constraint/);
  });

  it("solo RRHH y admin de la empresa: ni empleados ni otra empresa", async () => {
    await expect(savePlan(u.aEmp, orgA, jobA)).rejects.toThrow(/row-level security/);
    await expect(savePlan(u.bHr, orgA, jobA)).rejects.toThrow(/row-level security/);
    await expect(savePlan(u.bHr, orgB, jobA)).rejects.toThrow(/foreign key/);
    const planId = await savePlan(u.aHr, orgA, jobA);
    for (const user of [u.aEmp, u.bHr]) {
      for (const table of ["onboarding_plans", "onboarding_plan_tasks"]) {
        const rows = await query(db, user, `select 1 from public.${table} where org_id = $1`, [
          orgA.id,
        ]);
        expect(rows, `${user.label} en ${table}`).toEqual([]);
      }
    }
    expect(planId).toBeTruthy();
  });
});

describe("asignaciones de onboarding", () => {
  let planId: string;
  let assignmentId: string;

  beforeAll(async () => {
    planId = await savePlan(u.aHr, orgA, jobA);
    const [row] = await query<{ id: string }>(
      db,
      u.aHr,
      "select public.assign_onboarding_plan($1, $2, $3, $4) as id",
      [planId, "Nueva Incorporación", "2026-12-01", "Nueva@Example.com"],
    );
    assignmentId = row!.id;
  });

  it("copian las tareas con su fecha (inicio + día - 1) para una persona sin cuenta", async () => {
    const [assignment] = await query<{ employee_email: string; member_user_id: string | null }>(
      db,
      u.aHr,
      "select employee_email, member_user_id from public.onboarding_assignments where id = $1",
      [assignmentId],
    );
    expect(assignment).toEqual({ employee_email: "nueva@example.com", member_user_id: null });
    const tasks = await query<{ title: string; due: string }>(
      db,
      u.aHr,
      `select title, to_char(due_date, 'YYYY-MM-DD') as due
       from public.onboarding_assignment_tasks where assignment_id = $1 order by sort_order`,
      [assignmentId],
    );
    expect(tasks).toEqual([
      { title: TASKS[0]!.title, due: "2026-12-01" },
      { title: TASKS[1]!.title, due: "2026-12-30" },
      { title: TASKS[2]!.title, due: "2027-02-28" },
    ]);
  });

  it("quién completa una tarea lo fija la base de datos", async () => {
    const [task] = await query<{ id: string }>(
      db,
      u.aHr,
      "select id from public.onboarding_assignment_tasks where assignment_id = $1 order by sort_order limit 1",
      [assignmentId],
    );
    await exec(
      db,
      u.aHr,
      "update public.onboarding_assignment_tasks set completed_at = '2000-01-01' where id = $1",
      [task!.id],
    );
    const [done] = await query<{ completed_by: string; recent: boolean }>(
      db,
      u.aHr,
      `select completed_by, completed_at > now() - interval '1 minute' as recent
       from public.onboarding_assignment_tasks where id = $1`,
      [task!.id],
    );
    expect(done).toEqual({ completed_by: u.aHr.id, recent: true });
    // No se puede atribuir a otra persona ni cambiar otros campos.
    await expect(
      exec(
        db,
        u.aHr,
        "update public.onboarding_assignment_tasks set completed_by = $2 where id = $1",
        [task!.id, u.aAdmin.id],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(db, u.aHr, "update public.onboarding_assignment_tasks set title = 'x' where id = $1", [
        task!.id,
      ]),
    ).rejects.toThrow(/permission denied/);
    // Desmarcar borra el autor.
    await exec(
      db,
      u.aHr,
      "update public.onboarding_assignment_tasks set completed_at = null where id = $1",
      [task!.id],
    );
    const [undone] = await query<{ completed_by: string | null }>(
      db,
      u.aHr,
      "select completed_by from public.onboarding_assignment_tasks where id = $1",
      [task!.id],
    );
    expect(undone!.completed_by).toBeNull();
  });

  it("el empleado no ve su plan y otra empresa tampoco", async () => {
    for (const user of [u.aEmp, u.bHr, u.bAdmin]) {
      for (const table of ["onboarding_assignments", "onboarding_assignment_tasks"]) {
        const rows = await query(db, user, `select 1 from public.${table} where org_id = $1`, [
          orgA.id,
        ]);
        expect(rows, `${user.label} en ${table}`).toEqual([]);
      }
    }
  });

  it("solo se puede vincular a una persona de la empresa", async () => {
    await expect(
      query(db, u.aHr, "select public.assign_onboarding_plan($1, 'Otra', '2026-12-01', null, $2)", [
        planId,
        u.bHr.id,
      ]),
    ).rejects.toThrow(/no pertenece a la empresa/);
    const [row] = await query<{ id: string }>(
      db,
      u.aHr,
      "select public.assign_onboarding_plan($1, 'Empleada', '2026-12-01', null, $2) as id",
      [planId, u.aEmp.id],
    );
    expect(row!.id).toBeTruthy();
  });

  it("borrar el plan conserva el onboarding ya asignado", async () => {
    await exec(db, u.aHr, "delete from public.onboarding_plans where id = $1", [planId]);
    const [assignment] = await query<{ plan_id: string | null; plan_title: string }>(
      db,
      u.aHr,
      "select plan_id, plan_title from public.onboarding_assignments where id = $1",
      [assignmentId],
    );
    expect(assignment).toEqual({ plan_id: null, plan_title: "Plan de incorporación" });
    const [{ n }] = (await query<{ n: number }>(
      db,
      u.aHr,
      "select count(*)::int as n from public.onboarding_assignment_tasks where assignment_id = $1",
      [assignmentId],
    )) as [{ n: number }];
    expect(n).toBe(TASKS.length);
  });
});

describe("borrado de la empresa", () => {
  it("borra en cascada guías, planes y asignaciones", async () => {
    const admin = await createUser(db, "tmpOnbAdmin");
    const org = await createOrganization(db, admin, "Empresa Temporal Onboarding", "ES");
    const jobId = await createJob(admin, org);
    await insertGuide(admin, org, jobId, null);
    const planId = await savePlan(admin, org, jobId);
    await query(db, admin, "select public.assign_onboarding_plan($1, 'Persona', '2026-12-01')", [
      planId,
    ]);
    await db.query("delete from public.organizations where id = $1", [org.id]);
    const { rows } = await db.query(
      `select (select count(*) from public.interview_guides where org_id = $1)::int as g,
              (select count(*) from public.onboarding_plans where org_id = $1)::int as p,
              (select count(*) from public.onboarding_assignments where org_id = $1)::int as a,
              (select count(*) from public.onboarding_assignment_tasks where org_id = $1)::int as t`,
      [org.id],
    );
    expect(rows[0]).toEqual({ g: 0, p: 0, a: 0, t: 0 });
  });
});

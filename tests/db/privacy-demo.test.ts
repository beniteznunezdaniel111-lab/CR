/**
 * Fase 6 · Tope de IA visible para el admin, empresas demo, cierre de empresa y
 * borrado de los datos de una persona.
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
let org: Org;
const u = {} as Record<"admin" | "hr" | "emp" | "demoUser" | "outsider", TestUser>;
const createdOrgs: string[] = [];

/** Formación publicada con un intento del empleado (para comprobar borrados en cascada). */
async function trainingWithAttempt(target: Org, hr: TestUser, employee: TestUser) {
  const [training] = await query<{ id: string }>(
    db,
    hr,
    "insert into public.trainings (org_id, title) values ($1, 'Formación de prueba') returning id",
    [target.id],
  );
  await exec(
    db,
    hr,
    "insert into public.training_modules (org_id, training_id, position, title, content) values ($1, $2, 1, 'Módulo', 'Contenido')",
    [target.id, training!.id],
  );
  await query(db, hr, "select public.save_training_quiz($1, $2)", [
    training!.id,
    JSON.stringify([
      {
        question: "¿Pregunta de prueba?",
        options: ["Sí", "No"],
        correct_index: 0,
        explanation: "",
      },
    ]),
  ]);
  await query(db, hr, "select public.publish_training($1)", [training!.id]);
  await query(db, hr, "select public.assign_training($1, $2)", [training!.id, [employee.id]]);
  const { rows } = await db.query<{ id: string }>(
    "select id from public.training_assignments where training_id = $1 and user_id = $2",
    [training!.id, employee.id],
  );
  await query(db, employee, "select public.submit_training_attempt($1, $2)", [rows[0]!.id, [0]]);
  return training!.id;
}

beforeAll(async () => {
  db = await connect();
  for (const label of ["admin", "hr", "emp", "demoUser", "outsider"] as const) {
    u[label] = await createUser(db, label);
  }
  org = await createOrganization(db, u.admin, "Privacidad Alfa", "ES");
  createdOrgs.push(org.id);
  await inviteAndAccept(db, u.admin, org, u.hr, "hr");
  await inviteAndAccept(db, u.admin, org, u.emp, "employee");
});

afterAll(async () => {
  for (const id of createdOrgs) {
    await db.query("delete from public.organizations where id = $1", [id]);
  }
  await db?.end();
});

describe("tope de IA visible para el admin", () => {
  it("solo el admin ve el consumo del mes frente al tope", async () => {
    await exec(
      db,
      "service_role",
      `insert into public.ai_usage (org_id, feature, provider, model, status, cost_usd_est)
       values ($1, 'faq', 'mock', 'mock', 'ok', 1.5)`,
      [org.id],
    );
    const status = (user: TestUser) =>
      query<{ limit_usd: string; spent_usd: string }>(
        db,
        user,
        "select * from public.org_ai_budget_status($1)",
        [org.id],
      );
    expect(await status(u.admin)).toEqual([{ limit_usd: "20.00", spent_usd: "1.500000" }]);
    expect(await status(u.hr)).toEqual([]);
    expect(await status(u.emp)).toEqual([]);
    expect(await status(u.outsider)).toEqual([]);
  });
});

describe("empresas demo", () => {
  it("se crean marcadas como demo, con la persona como admin, y como mucho 3", async () => {
    for (let index = 1; index <= 3; index++) {
      const [row] = await query<{ id: string; is_demo: boolean }>(
        db,
        u.demoUser,
        "select id, is_demo from public.create_demo_organization($1, 'CR')",
        [`Demo ${index}`],
      );
      createdOrgs.push(row!.id);
      expect(row!.is_demo).toBe(true);
      const [membership] = await query<{ role: string }>(
        db,
        u.demoUser,
        "select role from public.memberships where org_id = $1 and user_id = $2",
        [row!.id, u.demoUser.id],
      );
      expect(membership!.role).toBe("admin");
    }
    await expect(
      query(db, u.demoUser, "select * from public.create_demo_organization('Demo 4', 'ES')"),
    ).rejects.toThrow(/3 empresas demo/);
  });

  it("una empresa normal no se puede marcar como demo a mano", async () => {
    await expect(
      exec(db, u.admin, "update public.organizations set is_demo = true where id = $1", [org.id]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("borrar los datos de una persona", () => {
  let trainingId: string;

  beforeAll(async () => {
    // Actividad del empleado: conversación, consulta respondida, formación con intento y onboarding.
    const [conversation] = await query<{ id: string }>(
      db,
      u.emp,
      "insert into public.faq_conversations (org_id, title) values ($1, 'Mi duda') returning id",
      [org.id],
    );
    await exec(
      db,
      u.emp,
      "insert into public.faq_messages (org_id, conversation_id, role, content) values ($1, $2, 'user', '¿Duda?')",
      [org.id, conversation!.id],
    );
    const [hrQuery] = await query<{ id: string }>(
      db,
      u.emp,
      "insert into public.hr_queries (org_id, question) values ($1, 'Consulta personal') returning id",
      [org.id],
    );
    await query(db, u.hr, "select public.answer_hr_query($1, 'Respuesta de RRHH')", [hrQuery!.id]);
    trainingId = await trainingWithAttempt(org, u.hr, u.emp);
    const [job] = await query<{ id: string }>(
      db,
      u.hr,
      "select public.save_job_position($1, $2, $3) as id",
      [
        org.id,
        JSON.stringify({
          title: "Técnico/a",
          level: "mid",
          work_mode: "onsite",
          responsibilities: "Tareas del puesto de prueba.",
          tone: "professional",
        }),
        JSON.stringify([{ text: "Experiencia", kind: "required" }]),
      ],
    );
    const [plan] = await query<{ id: string }>(
      db,
      u.hr,
      "select public.save_onboarding_plan($1, $2, 'Plan', 'Intro', $3) as id",
      [
        org.id,
        job!.id,
        JSON.stringify([{ phase: "d30", title: "Bienvenida", due_day: 1, owner_label: "RRHH" }]),
      ],
    );
    await query(
      db,
      u.hr,
      "select public.assign_onboarding_plan($1, 'Empleado', current_date, null, $2)",
      [plan!.id, u.emp.id],
    );
  });

  it("solo un admin puede hacerlo, y no sobre sí mismo", async () => {
    await expect(
      query(db, u.hr, "select public.erase_member_data($1, $2)", [org.id, u.emp.id]),
    ).rejects.toThrow(/Empresa no encontrada/);
    await expect(
      query(db, u.admin, "select public.erase_member_data($1, $2)", [org.id, u.admin.id]),
    ).rejects.toThrow(/tus propios datos/);
    await expect(
      query(db, "service_role", "select public.erase_member_data($1, $2)", [org.id, u.emp.id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("borra su actividad personal y su membresía, sin dejar su identidad en la auditoría", async () => {
    await query(db, u.admin, "select public.erase_member_data($1, $2)", [org.id, u.emp.id]);
    const { rows } = await db.query<Record<string, number>>(
      `select
         (select count(*) from public.faq_conversations where org_id = $1 and user_id = $2)::int as conversations,
         (select count(*) from public.hr_queries where org_id = $1 and requester_id = $2)::int as queries,
         (select count(*) from public.notifications where org_id = $1 and user_id = $2)::int as notifications,
         (select count(*) from public.training_assignments where org_id = $1 and user_id = $2)::int as assignments,
         (select count(*) from public.training_attempts where org_id = $1 and user_id = $2)::int as attempts,
         (select count(*) from public.onboarding_assignments where org_id = $1 and member_user_id = $2)::int as onboarding,
         (select count(*) from public.memberships where org_id = $1 and user_id = $2)::int as memberships`,
      [org.id, u.emp.id],
    );
    expect(rows[0]).toEqual({
      conversations: 0,
      queries: 0,
      notifications: 0,
      assignments: 0,
      attempts: 0,
      onboarding: 0,
      memberships: 0,
    });
    // La formación sigue existiendo (sin intentos ya se podría editar).
    const training = await db.query("select 1 from public.trainings where id = $1", [trainingId]);
    expect(training.rowCount).toBe(1);
    const audit = await query<{ entity_id: string | null; details: unknown }>(
      db,
      u.admin,
      "select entity_id, details from public.audit_events where org_id = $1 and action = 'member.data_erased'",
      [org.id],
    );
    expect(audit).toEqual([{ entity_id: null, details: {} }]);
  });
});

describe("cerrar una empresa", () => {
  let target: Org;

  beforeAll(async () => {
    target = await createOrganization(db, u.outsider, "Empresa a cerrar", "CR");
    createdOrgs.push(target.id);
    const employee = await createUser(db, "closeEmp");
    await inviteAndAccept(db, u.outsider, target, employee, "employee");
    await trainingWithAttempt(target, u.outsider, employee);
    await exec(
      db,
      "service_role",
      `insert into public.ai_usage (org_id, feature, provider, model, status) values ($1, 'faq', 'mock', 'mock', 'ok')`,
      [target.id],
    );
  });

  it("solo el admin, escribiendo el nombre exacto", async () => {
    await expect(
      query(db, u.admin, "select public.close_organization($1, 'Empresa a cerrar')", [target.id]),
    ).rejects.toThrow(/Empresa no encontrada/);
    await expect(
      query(db, u.outsider, "select public.close_organization($1, 'Otra')", [target.id]),
    ).rejects.toThrow(/no coincide/);
    await expect(
      query(db, "service_role", "select public.close_organization($1, 'Empresa a cerrar')", [
        target.id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("borra la empresa y todos sus datos (también intentos, auditoría y uso de IA)", async () => {
    await query(db, u.outsider, "select public.close_organization($1, 'Empresa a cerrar')", [
      target.id,
    ]);
    const { rows } = await db.query<Record<string, number>>(
      `select
         (select count(*) from public.organizations where id = $1)::int as orgs,
         (select count(*) from public.memberships where org_id = $1)::int as memberships,
         (select count(*) from public.trainings where org_id = $1)::int as trainings,
         (select count(*) from public.training_attempts where org_id = $1)::int as attempts,
         (select count(*) from public.audit_events where org_id = $1)::int as audit,
         (select count(*) from public.ai_usage where org_id = $1)::int as usage`,
      [target.id],
    );
    expect(rows[0]).toEqual({
      orgs: 0,
      memberships: 0,
      trainings: 0,
      attempts: 0,
      audit: 0,
      usage: 0,
    });
  });
});

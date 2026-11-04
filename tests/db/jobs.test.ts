/**
 * Fase 1 · Puestos, requisitos y versiones: aislamiento, permisos e integridad.
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
const u = {} as Record<"aAdmin" | "aHr" | "aEmp" | "bAdmin", TestUser>;

const FIELDS = {
  title: "Técnico/a de logística",
  department: "Operaciones",
  level: "mid",
  work_mode: "hybrid",
  location: "Madrid",
  responsibilities: "Coordinar envíos y gestionar el almacén.",
  salary_min: "28000",
  salary_max: "34000",
  salary_currency: "EUR",
  salary_period: "year",
  benefits: "Seguro médico",
  tone: "friendly",
};

async function saveJob(
  user: TestUser,
  org: Org,
  jobId: string | null,
  requirements: Array<{ id?: string; text: string; kind: "required" | "preferred" }>,
  fields: Record<string, string> = FIELDS,
): Promise<string> {
  const [row] = await query<{ id: string }>(
    db,
    user,
    "select public.save_job_position($1, $2, $3, $4) as id",
    [org.id, JSON.stringify(fields), JSON.stringify(requirements), jobId],
  );
  return row!.id;
}

async function requirementsOf(user: TestUser, jobId: string) {
  return query<{ id: string; text: string; kind: string; sort_order: number }>(
    db,
    user,
    "select id, text, kind, sort_order from public.job_requirements where job_id = $1 order by sort_order",
    [jobId],
  );
}

beforeAll(async () => {
  db = await connect();
  for (const label of ["aAdmin", "aHr", "aEmp", "bAdmin"] as const) {
    u[label] = await createUser(db, label);
  }
  orgA = await createOrganization(db, u.aAdmin, "Jobs Alfa", "ES");
  orgB = await createOrganization(db, u.bAdmin, "Jobs Beta", "CR");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aHr, "hr");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aEmp, "employee");
});

afterAll(async () => {
  for (const org of [orgA, orgB]) {
    if (org) await db.query("delete from public.organizations where id = $1", [org.id]);
  }
  await db?.end();
});

describe("puestos y requisitos", () => {
  it("RRHH crea un puesto con sus requisitos en orden", async () => {
    const jobId = await saveJob(u.aHr, orgA, null, [
      { text: "Experiencia en logística", kind: "required" },
      { text: "Inglés B2", kind: "preferred" },
    ]);
    const reqs = await requirementsOf(u.aHr, jobId);
    expect(reqs.map((r) => [r.text, r.kind, r.sort_order])).toEqual([
      ["Experiencia en logística", "required", 1],
      ["Inglés B2", "preferred", 2],
    ]);
  });

  it("al editar se conservan los ids de los requisitos que siguen y se borran los quitados", async () => {
    const jobId = await saveJob(u.aHr, orgA, null, [
      { text: "Req A", kind: "required" },
      { text: "Req B", kind: "required" },
      { text: "Req C", kind: "preferred" },
    ]);
    const [a, , c] = await requirementsOf(u.aHr, jobId);
    await saveJob(u.aHr, orgA, jobId, [
      { id: c!.id, text: "Req C modificado", kind: "required" },
      { id: a!.id, text: "Req A", kind: "required" },
      { text: "Req D nuevo", kind: "preferred" },
    ]);
    const after = await requirementsOf(u.aHr, jobId);
    expect(after.map((r) => r.text)).toEqual(["Req C modificado", "Req A", "Req D nuevo"]);
    expect(after[0]!.id).toBe(c!.id);
    expect(after[1]!.id).toBe(a!.id);
  });

  it("el empleado no ve ni crea puestos", async () => {
    await saveJob(u.aHr, orgA, null, []);
    expect(await query(db, u.aEmp, "select id from public.job_positions")).toEqual([]);
    await expect(saveJob(u.aEmp, orgA, null, [])).rejects.toThrow(/row-level security/);
  });

  it("otra empresa no ve ni modifica los puestos", async () => {
    const jobId = await saveJob(u.aHr, orgA, null, [{ text: "Req", kind: "required" }]);
    expect(await query(db, u.bAdmin, "select id from public.job_positions")).toEqual([]);
    expect(await query(db, u.bAdmin, "select id from public.job_requirements")).toEqual([]);
    // Intentar editarlo indicando la empresa propia o la ajena falla igual.
    await expect(saveJob(u.bAdmin, orgB, jobId, [])).rejects.toThrow(/no encontrado/);
    await expect(saveJob(u.bAdmin, orgA, jobId, [])).rejects.toThrow(/no encontrado/);
    expect(
      await exec(db, u.bAdmin, "delete from public.job_positions where id = $1", [jobId]),
    ).toBe(0);
  });

  it("las FK compuestas impiden colgar datos de un puesto de otra empresa", async () => {
    const jobA = await saveJob(u.aHr, orgA, null, []);
    // Admin de B intenta añadir un requisito con su org_id a un puesto de A.
    await expect(
      exec(
        db,
        u.bAdmin,
        "insert into public.job_requirements (org_id, job_id, text, kind) values ($1, $2, 'Requisito intruso', 'required')",
        [orgB.id, jobA],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("valida la banda salarial", async () => {
    await expect(
      saveJob(u.aHr, orgA, null, [], { ...FIELDS, salary_min: "40000", salary_max: "30000" }),
    ).rejects.toThrow(/job_salary_range/);
    await expect(
      saveJob(u.aHr, orgA, null, [], { ...FIELDS, salary_currency: "", salary_period: "" }),
    ).rejects.toThrow(/job_salary_unit/);
    const noSalary = await saveJob(u.aHr, orgA, null, [], {
      ...FIELDS,
      salary_min: "",
      salary_max: "",
      salary_currency: "",
      salary_period: "",
    });
    expect(noSalary).toMatch(/[0-9a-f-]{36}/);
  });

  it("rechaza listas de requisitos inválidas", async () => {
    const tooMany = Array.from({ length: 31 }, (_, i) => ({
      text: `Req ${i}`,
      kind: "required" as const,
    }));
    await expect(saveJob(u.aHr, orgA, null, tooMany)).rejects.toThrow(/no válida/);
  });
});

describe("versiones", () => {
  it("se numeran solas y no se pueden editar ni borrar (salvo la revisión inclusiva)", async () => {
    const jobId = await saveJob(u.aHr, orgA, null, []);
    const insert = `insert into public.job_position_versions
      (org_id, job_id, source, internal_description_md) values ($1, $2, $3, $4)
      returning version_number`;
    const [v1] = await query<{ version_number: number }>(db, u.aHr, insert, [
      orgA.id,
      jobId,
      "ai",
      "uno",
    ]);
    const [v2] = await query<{ version_number: number }>(db, u.aHr, insert, [
      orgA.id,
      jobId,
      "manual",
      "dos",
    ]);
    expect([v1!.version_number, v2!.version_number]).toEqual([1, 2]);

    await expect(
      exec(
        db,
        u.aHr,
        "update public.job_position_versions set internal_description_md = 'x' where job_id = $1",
        [jobId],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(db, u.aHr, "delete from public.job_position_versions where job_id = $1", [jobId]),
    ).rejects.toThrow(/permission denied/);
    expect(
      await exec(
        db,
        u.aHr,
        "update public.job_position_versions set inclusive_review = '{\"findings\":[]}', inclusive_reviewed_at = now() where job_id = $1",
        [jobId],
      ),
    ).toBe(2);
  });

  it("no se puede fijar el número de versión a mano", async () => {
    const jobId = await saveJob(u.aHr, orgA, null, []);
    await expect(
      exec(
        db,
        u.aHr,
        "insert into public.job_position_versions (org_id, job_id, source, version_number) values ($1, $2, 'manual', 99)",
        [orgA.id, jobId],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("el empleado y otras empresas no ven las versiones", async () => {
    const jobId = await saveJob(u.aHr, orgA, null, []);
    await exec(
      db,
      u.aHr,
      "insert into public.job_position_versions (org_id, job_id, source) values ($1, $2, 'manual')",
      [orgA.id, jobId],
    );
    expect(await query(db, u.aEmp, "select id from public.job_position_versions")).toEqual([]);
    expect(await query(db, u.bAdmin, "select id from public.job_position_versions")).toEqual([]);
  });

  it("borrar un puesto borra sus requisitos y versiones", async () => {
    const jobId = await saveJob(u.aHr, orgA, null, [{ text: "Req", kind: "required" }]);
    await exec(
      db,
      u.aHr,
      "insert into public.job_position_versions (org_id, job_id, source) values ($1, $2, 'manual')",
      [orgA.id, jobId],
    );
    expect(await exec(db, u.aHr, "delete from public.job_positions where id = $1", [jobId])).toBe(
      1,
    );
    const { rows } = await db.query(
      `select (select count(*) from public.job_requirements where job_id = $1)::int as r,
              (select count(*) from public.job_position_versions where job_id = $1)::int as v`,
      [jobId],
    );
    expect(rows[0]).toEqual({ r: 0, v: 0 });
  });

  it("RRHH ve los eventos de auditoría de puestos", async () => {
    const jobId = await saveJob(u.aHr, orgA, null, []);
    await exec(
      db,
      "service_role",
      "insert into public.audit_events (org_id, actor_id, action, entity_type, entity_id) values ($1, $2, 'job.created', 'job', $3)",
      [orgA.id, u.aHr.id, jobId],
    );
    const rows = await query<{ action: string }>(
      db,
      u.aHr,
      "select action from public.audit_events where entity_id = $1",
      [jobId],
    );
    expect(rows.map((r) => r.action)).toEqual(["job.created"]);
  });
});

/**
 * Fase 2 · Candidaturas: aislamiento, decisiones solo humanas, modo anónimo
 * (base de datos y Storage), retención e integridad.
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
let openJob: string;
let anonJob: string;

const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const JOB_FIELDS = {
  title: "Técnico/a de logística",
  level: "mid",
  work_mode: "hybrid",
  responsibilities: "Coordinar envíos y gestionar el almacén.",
  tone: "professional",
};

async function createJob(user: TestUser, org: Org): Promise<string> {
  const [row] = await query<{ id: string }>(
    db,
    user,
    "select public.save_job_position($1, $2, $3) as id",
    [
      org.id,
      JSON.stringify(JOB_FIELDS),
      JSON.stringify([
        { text: "Experiencia en gestión de almacén", kind: "required" },
        { text: "Inglés B2", kind: "preferred" },
      ]),
    ],
  );
  return row!.id;
}

type Registered = { candidate_id: string; cv_path: string; candidate_number: number };

/** Registra CVs como lo hace el servidor y simula su subida a Storage. */
async function register(
  user: TestUser,
  jobId: string,
  files: Array<{ filename: string; mime: string; size: number }>,
): Promise<Registered[]> {
  const rows = await query<Registered>(
    db,
    user,
    "select * from public.register_candidates($1, $2)",
    [jobId, JSON.stringify(files)],
  );
  for (const row of rows) {
    await db.query("insert into storage.objects (bucket_id, name) values ('cvs', $1)", [
      row.cv_path,
    ]);
  }
  return rows;
}

const cv = (filename = "CV Ana Martín.pdf", mime = PDF) => ({ filename, mime, size: 120_000 });

async function visibleCvFiles(user: TestUser, path: string) {
  return query(db, user, "select name from storage.objects where bucket_id = 'cvs' and name = $1", [
    path,
  ]);
}

async function piiOf(user: TestUser, candidateId: string) {
  return query<{ full_name: string | null; cv_filename: string | null }>(
    db,
    user,
    "select full_name, cv_filename from public.candidate_pii where candidate_id = $1",
    [candidateId],
  );
}

async function lastAudit(entityId: string) {
  const { rows } = await db.query<{ action: string; actor_id: string; details: unknown }>(
    `select action, actor_id, details from public.audit_events
     where entity_id = $1 order by id desc limit 1`,
    [entityId],
  );
  return rows[0];
}

beforeAll(async () => {
  db = await connect();
  for (const label of ["aAdmin", "aHr", "aEmp", "bAdmin", "bHr"] as const) {
    u[label] = await createUser(db, label);
  }
  orgA = await createOrganization(db, u.aAdmin, "Candidatos Alfa", "ES");
  orgB = await createOrganization(db, u.bAdmin, "Candidatos Beta", "CR");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aHr, "hr");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aEmp, "employee");
  await inviteAndAccept(db, u.bAdmin, orgB, u.bHr, "hr");

  openJob = await createJob(u.aHr, orgA);
  anonJob = await createJob(u.aHr, orgA);
  await exec(db, u.aHr, "update public.job_positions set anonymous_review = true where id = $1", [
    anonJob,
  ]);
});

afterAll(async () => {
  for (const org of [orgA, orgB]) {
    if (!org) continue;
    await db.query("delete from storage.objects where name like $1", [`${org.id}/%`]);
    await db.query("delete from public.organizations where id = $1", [org.id]);
  }
  await db?.end();
});

describe("registro de CVs", () => {
  it("asigna un alias correlativo, la ruta de la empresa y la fecha de retención", async () => {
    const rows = await register(u.aHr, openJob, [cv("uno.pdf"), cv("dos.docx", DOCX)]);
    expect(rows.map((row) => row.candidate_number)).toEqual([1, 2]);
    expect(rows[0]!.cv_path).toBe(`${orgA.id}/${openJob}/${rows[0]!.candidate_id}.pdf`);
    expect(rows[1]!.cv_path).toBe(`${orgA.id}/${openJob}/${rows[1]!.candidate_id}.docx`);

    const { rows: check } = await db.query(
      `select bool_and(retention_until = created_at + interval '12 months') as ok,
              bool_and(status = 'pending' and processing_status = 'pending') as initial
       from public.candidates where id = any ($1)`,
      [rows.map((row) => row.candidate_id)],
    );
    expect(check[0]).toEqual({ ok: true, initial: true });
    expect(await piiOf(u.aHr, rows[0]!.candidate_id)).toEqual([
      { full_name: null, cv_filename: "uno.pdf" },
    ]);
  });

  it("el alias no se reutiliza aunque se borre la última candidatura", async () => {
    const [first] = await register(u.aHr, openJob, [cv()]);
    await exec(db, u.aHr, "delete from public.candidates where id = $1", [first!.candidate_id]);
    const [next] = await register(u.aHr, openJob, [cv()]);
    expect(next!.candidate_number).toBe(first!.candidate_number + 1);
  });

  it("valida el número de ficheros y el tipo", async () => {
    await expect(register(u.aHr, openJob, [])).rejects.toThrow(/entre 1 y 20/);
    await expect(
      register(
        u.aHr,
        openJob,
        Array.from({ length: 21 }, () => cv()),
      ),
    ).rejects.toThrow(/entre 1 y 20/);
    await expect(
      register(u.aHr, openJob, [{ filename: "foto.png", mime: "image/png", size: 10 }]),
    ).rejects.toThrow(/check constraint/);
  });

  it("solo admin y RRHH de la empresa del puesto pueden registrar CVs", async () => {
    await expect(register(u.aEmp, openJob, [cv()])).rejects.toThrow(/no encontrado/);
    await expect(register(u.bHr, openJob, [cv()])).rejects.toThrow(/no encontrado/);
    // Ni insertando directamente en la tabla con la empresa de otro.
    await expect(
      exec(
        db,
        u.bHr,
        `insert into public.candidates (id, org_id, job_id, cv_path, cv_mime, cv_size)
         values (gen_random_uuid(), $1, $2, 'x', $3, 1)`,
        [orgA.id, openJob, PDF],
      ),
    ).rejects.toThrow(/row-level security|check constraint/);
  });
});

describe("aislamiento", () => {
  it("otra empresa y los empleados no ven candidaturas, datos, análisis ni historial", async () => {
    const tables = [
      "candidates",
      "candidate_pii",
      "cv_analyses",
      "cv_requirement_matches",
      "candidate_events",
    ];
    for (const table of tables) {
      for (const user of [u.aEmp, u.bHr, u.bAdmin]) {
        const rows = await query<{ n: number }>(
          db,
          user,
          `select count(*)::int as n from public.${table} where org_id = $1`,
          [orgA.id],
        );
        expect(rows[0]!.n, `${user.label} en ${table}`).toBe(0);
      }
    }
  });
});

describe("decisiones humanas", () => {
  let candidateId: string;

  beforeAll(async () => {
    const [row] = await register(u.aHr, openJob, [cv()]);
    candidateId = row!.candidate_id;
  });

  it("el estado no se puede cambiar directamente, ni siquiera RRHH", async () => {
    await expect(
      exec(db, u.aHr, "update public.candidates set status = 'advance' where id = $1", [
        candidateId,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(
        db,
        u.aHr,
        "update public.candidates set identity_revealed_at = now(), retention_until = now() where id = $1",
        [candidateId],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("set_candidate_status exige una persona de RRHH o admin de la empresa", async () => {
    const call = "select public.set_candidate_status($1, 'advance', null)";
    await expect(query(db, u.aEmp, call, [candidateId])).rejects.toThrow(/no encontrada/);
    await expect(query(db, u.bHr, call, [candidateId])).rejects.toThrow(/no encontrada/);
    // Sin una persona detrás (p. ej. un proceso de servidor con la clave de servicio).
    await expect(query(db, "service_role", call, [candidateId])).rejects.toThrow(
      /permission denied/,
    );
    await expect(query(db, "anon", call, [candidateId])).rejects.toThrow(/permission denied/);
  });

  it("guarda quién y cuándo, el historial con comentario y una auditoría sin el comentario", async () => {
    await query(db, u.aHr, "select public.set_candidate_status($1, 'reviewed', $2)", [
      candidateId,
      "Encaja con la experiencia en almacén.",
    ]);
    await query(db, u.aAdmin, "select public.set_candidate_status($1, 'advance')", [candidateId]);

    const [candidate] = await query<{ status: string; status_changed_by: string }>(
      db,
      u.aHr,
      "select status, status_changed_by from public.candidates where id = $1",
      [candidateId],
    );
    expect(candidate).toEqual({ status: "advance", status_changed_by: u.aAdmin.id });

    const events = await query<{ from_status: string; to_status: string; note: string | null }>(
      db,
      u.aHr,
      `select from_status, to_status, note from public.candidate_events
       where candidate_id = $1 order by created_at, to_status`,
      [candidateId],
    );
    expect(events).toEqual([
      {
        from_status: "pending",
        to_status: "reviewed",
        note: "Encaja con la experiencia en almacén.",
      },
      { from_status: "reviewed", to_status: "advance", note: null },
    ]);

    const audit = await lastAudit(candidateId);
    expect(audit).toMatchObject({
      action: "candidate.status_changed",
      actor_id: u.aAdmin.id,
      details: { from: "reviewed", to: "advance", with_comment: false, job_id: openJob },
    });
    const { rows } = await db.query(
      "select count(*)::int as n from public.audit_events where entity_id = $1 and details::text like '%almacén%'",
      [candidateId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("no acepta el mismo estado ni comentarios demasiado largos", async () => {
    await expect(
      query(db, u.aHr, "select public.set_candidate_status($1, 'advance')", [candidateId]),
    ).rejects.toThrow(/ya tiene ese estado/);
    await expect(
      query(db, u.aHr, "select public.set_candidate_status($1, 'no_advance', $2)", [
        candidateId,
        "x".repeat(1001),
      ]),
    ).rejects.toThrow(/demasiado largo/);
  });

  it("el historial no se puede escribir ni modificar directamente", async () => {
    await expect(
      exec(
        db,
        u.aHr,
        `insert into public.candidate_events (org_id, candidate_id, kind) values ($1, $2, 'status_changed')`,
        [orgA.id, candidateId],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(db, u.aHr, "delete from public.candidate_events where candidate_id = $1", [candidateId]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("modo anónimo", () => {
  let anonCandidate: Registered;
  let openCandidate: Registered;

  beforeAll(async () => {
    [anonCandidate] = (await register(u.aHr, anonJob, [cv("CV Ana Martín.pdf")])) as [Registered];
    [openCandidate] = (await register(u.aHr, openJob, [cv("CV Luis Pérez.pdf")])) as [Registered];
    // La extracción guarda los datos identificativos aunque RRHH no pueda leerlos.
    for (const row of [anonCandidate, openCandidate]) {
      await query(db, u.aHr, "select public.store_candidate_extraction($1, $2, $3)", [
        row.candidate_id,
        JSON.stringify({ full_name: "Nombre Real", email: "real@example.com", links: [] }),
        "Texto del CV sin datos identificativos",
      ]);
    }
  });

  it("oculta los datos identificativos y el CV original a RRHH y a admin", async () => {
    for (const user of [u.aHr, u.aAdmin]) {
      expect(await piiOf(user, anonCandidate.candidate_id)).toEqual([]);
      expect(await visibleCvFiles(user, anonCandidate.cv_path)).toEqual([]);
    }
    // El texto anonimizado sí está disponible para revisar.
    const [row] = await query<{ redacted_text: string }>(
      db,
      u.aHr,
      "select redacted_text from public.candidates where id = $1",
      [anonCandidate.candidate_id],
    );
    expect(row!.redacted_text).toBe("Texto del CV sin datos identificativos");
    // Los datos se guardaron.
    const { rows } = await db.query(
      "select full_name from public.candidate_pii where candidate_id = $1",
      [anonCandidate.candidate_id],
    );
    expect(rows).toEqual([{ full_name: "Nombre Real" }]);
  });

  it("en un puesto no anónimo RRHH ve los datos y el CV, y otra empresa no", async () => {
    expect(await piiOf(u.aHr, openCandidate.candidate_id)).toEqual([
      { full_name: "Nombre Real", cv_filename: "CV Luis Pérez.pdf" },
    ]);
    expect(await visibleCvFiles(u.aHr, openCandidate.cv_path)).toHaveLength(1);
    expect(await visibleCvFiles(u.aEmp, openCandidate.cv_path)).toEqual([]);
    expect(await visibleCvFiles(u.bHr, openCandidate.cv_path)).toEqual([]);
    expect(await piiOf(u.bHr, openCandidate.candidate_id)).toEqual([]);
  });

  it("revelar la identidad exige motivo, queda en el historial y se audita", async () => {
    const reveal = "select public.reveal_candidate_identity($1, $2)";
    await expect(query(db, u.aHr, reveal, [anonCandidate.candidate_id, "corto"])).rejects.toThrow(
      /motivo/,
    );
    await expect(
      query(db, u.bHr, reveal, [anonCandidate.candidate_id, "Concertar la entrevista final"]),
    ).rejects.toThrow(/no encontrada/);
    await expect(
      query(db, u.aHr, reveal, [openCandidate.candidate_id, "Concertar la entrevista final"]),
    ).rejects.toThrow(/no usa revisión anónima/);

    await query(db, u.aHr, reveal, [anonCandidate.candidate_id, "Concertar la entrevista final"]);
    expect(await piiOf(u.aHr, anonCandidate.candidate_id)).toEqual([
      { full_name: "Nombre Real", cv_filename: "CV Ana Martín.pdf" },
    ]);
    expect(await visibleCvFiles(u.aHr, anonCandidate.cv_path)).toHaveLength(1);

    const events = await query<{ kind: string; note: string }>(
      db,
      u.aHr,
      "select kind, note from public.candidate_events where candidate_id = $1",
      [anonCandidate.candidate_id],
    );
    expect(events).toEqual([{ kind: "identity_revealed", note: "Concertar la entrevista final" }]);
    expect(await lastAudit(anonCandidate.candidate_id)).toMatchObject({
      action: "candidate.identity_revealed",
      actor_id: u.aHr.id,
      details: { job_id: anonJob },
    });
    await expect(
      query(db, u.aHr, reveal, [anonCandidate.candidate_id, "Concertar la entrevista final"]),
    ).rejects.toThrow(/ya está revelada/);
  });

  it("no se puede desactivar en un puesto con candidaturas; activarlo sí, y se audita", async () => {
    await expect(
      exec(db, u.aHr, "update public.job_positions set anonymous_review = false where id = $1", [
        anonJob,
      ]),
    ).rejects.toThrow(/No se puede desactivar/);

    const emptyJob = await createJob(u.aHr, orgA);
    await exec(db, u.aHr, "update public.job_positions set anonymous_review = true where id = $1", [
      emptyJob,
    ]);
    expect(await lastAudit(emptyJob)).toMatchObject({
      action: "job.anonymous_review_changed",
      details: { enabled: true },
    });
    // Sin candidaturas todavía se puede desactivar.
    await exec(
      db,
      u.aHr,
      "update public.job_positions set anonymous_review = false where id = $1",
      [emptyJob],
    );
  });

  it("los datos identificativos no se editan directamente", async () => {
    await expect(
      exec(db, u.aHr, "update public.candidate_pii set full_name = 'x' where candidate_id = $1", [
        openCandidate.candidate_id,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      query(db, u.bHr, "select public.store_candidate_extraction($1, '{}', 'x')", [
        openCandidate.candidate_id,
      ]),
    ).rejects.toThrow(/no encontrada/);
  });
});

describe("análisis", () => {
  let candidateId: string;
  let analysisId: string;

  beforeAll(async () => {
    const [row] = await register(u.aHr, openJob, [cv()]);
    candidateId = row!.candidate_id;
    const [analysis] = await query<{ id: string }>(
      db,
      u.aHr,
      `insert into public.cv_analyses (org_id, candidate_id, summary, prompt_id, prompt_version, model,
         required_met, required_total)
       values ($1, $2, 'Resumen', 'cv.analysis', 1, 'claude-haiku-5-5', 1, 1) returning id`,
      [orgA.id, candidateId],
    );
    analysisId = analysis!.id;
    await exec(
      db,
      u.aHr,
      `insert into public.cv_requirement_matches (org_id, analysis_id, requirement_text, requirement_kind,
         result, evidence, evidence_verified)
       values ($1, $2, 'Experiencia en gestión de almacén', 'required', 'meets', 'gestión de almacén', true)`,
      [orgA.id, analysisId],
    );
  });

  it("son inmutables", async () => {
    await expect(
      exec(db, u.aHr, "update public.cv_analyses set summary = 'otro' where id = $1", [analysisId]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(
        db,
        u.aHr,
        "update public.cv_requirement_matches set result = 'partial' where analysis_id = $1",
        [analysisId],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(db, u.aHr, "delete from public.cv_analyses where id = $1", [analysisId]),
    ).rejects.toThrow(/permission denied/);
  });

  it("no se pueden colgar de una candidatura de otra empresa", async () => {
    await expect(
      exec(
        db,
        u.bHr,
        `insert into public.cv_analyses (org_id, candidate_id, summary, prompt_id, prompt_version, model)
         values ($1, $2, 'x', 'cv.analysis', 1, 'm')`,
        [orgB.id, candidateId],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("borrar una candidatura borra sus datos, análisis e historial", async () => {
    await query(db, u.aHr, "select public.set_candidate_status($1, 'reviewed')", [candidateId]);
    expect(
      await exec(db, u.aHr, "delete from public.candidates where id = $1", [candidateId]),
    ).toBe(1);
    const { rows } = await db.query(
      `select (select count(*) from public.candidate_pii where candidate_id = $1)::int as pii,
              (select count(*) from public.cv_analyses where candidate_id = $1)::int as analyses,
              (select count(*) from public.cv_requirement_matches where analysis_id = $2)::int as matches,
              (select count(*) from public.candidate_events where candidate_id = $1)::int as events,
              (select count(*) from public.audit_events where entity_id = $1)::int as audit`,
      [candidateId, analysisId],
    );
    // La auditoría (seudónima) se conserva.
    expect(rows[0]).toEqual({ pii: 0, analyses: 0, matches: 0, events: 0, audit: 1 });
  });
});

describe("retención", () => {
  it("si la empresa cambia el plazo, se recalcula la fecha de borrado de sus candidaturas", async () => {
    const [row] = await register(u.aHr, openJob, [cv()]);
    await exec(
      db,
      u.aAdmin,
      "update public.organizations set cv_retention_months = 6 where id = $1",
      [orgA.id],
    );
    const { rows } = await db.query(
      `select bool_and(retention_until = created_at + interval '6 months') as ok
       from public.candidates where org_id = $1`,
      [orgA.id],
    );
    expect(rows[0].ok).toBe(true);
    const { rows: other } = await db.query(
      "select retention_until = created_at + interval '6 months' as six from public.candidates where id = $1",
      [row!.candidate_id],
    );
    expect(other[0].six).toBe(true);
    await exec(
      db,
      u.aAdmin,
      "update public.organizations set cv_retention_months = 12 where id = $1",
      [orgA.id],
    );
  });
});

describe("borrado de puestos y empresas", () => {
  it("un puesto con candidaturas no se puede borrar; sin ellas, sí", async () => {
    const jobId = await createJob(u.aHr, orgA);
    const [row] = await register(u.aHr, jobId, [cv()]);
    await expect(
      exec(db, u.aHr, "delete from public.job_positions where id = $1", [jobId]),
    ).rejects.toThrow(/tiene candidaturas/);
    await exec(db, u.aHr, "delete from public.candidates where id = $1", [row!.candidate_id]);
    expect(await exec(db, u.aHr, "delete from public.job_positions where id = $1", [jobId])).toBe(
      1,
    );
  });

  it("al borrar la empresa completa se borran sus candidaturas en cascada", async () => {
    const admin = await createUser(db, "tmpCandAdmin");
    const org = await createOrganization(db, admin, "Empresa Temporal CVs", "ES");
    const jobId = await createJob(admin, org);
    const [row] = await register(admin, jobId, [cv()]);
    await db.query("delete from storage.objects where name = $1", [row!.cv_path]);
    await db.query("delete from public.organizations where id = $1", [org.id]);
    const { rows } = await db.query(
      "select count(*)::int as n from public.candidates where id = $1",
      [row!.candidate_id],
    );
    expect(rows[0].n).toBe(0);
  });
});

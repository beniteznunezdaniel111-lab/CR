/**
 * Aislamiento multiempresa y permisos por rol (Fase 0).
 * Dos empresas (A en ES, B en CR) con admin, RRHH y empleado cada una, más un
 * usuario ajeno. Ningún usuario puede ver ni tocar datos de otra empresa.
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
  newInvitationToken,
  query,
} from "./helpers";

let db: Client;
let orgA: Org;
let orgB: Org;
const u = {} as Record<
  "aAdmin" | "aHr" | "aEmp" | "bAdmin" | "bHr" | "bEmp" | "outsider",
  TestUser
>;

beforeAll(async () => {
  db = await connect();
  for (const label of ["aAdmin", "aHr", "aEmp", "bAdmin", "bHr", "bEmp", "outsider"] as const) {
    u[label] = await createUser(db, label);
  }
  orgA = await createOrganization(db, u.aAdmin, "Empresa Alfa Test", "ES");
  orgB = await createOrganization(db, u.bAdmin, "Empresa Beta Test", "CR");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aHr, "hr");
  await inviteAndAccept(db, u.aAdmin, orgA, u.aEmp, "employee");
  await inviteAndAccept(db, u.bAdmin, orgB, u.bHr, "hr");
  await inviteAndAccept(db, u.bAdmin, orgB, u.bEmp, "employee");

  // Uso de IA registrado por el servidor (service_role) en ambas empresas.
  for (const org of [orgA, orgB]) {
    await exec(
      db,
      "service_role",
      `insert into public.ai_usage (org_id, feature, provider, model, status, cost_usd_est)
       values ($1, 'test.feature', 'mock', 'mock', 'ok', 0.01)`,
      [org.id],
    );
  }

  // Ficheros en Storage de ambas empresas.
  for (const org of [orgA, orgB]) {
    for (const bucket of ["cvs", "kb-documents", "training-sources"]) {
      await db.query("insert into storage.objects (bucket_id, name) values ($1, $2)", [
        bucket,
        `${org.id}/fixture-${bucket}.pdf`,
      ]);
    }
  }
});

afterAll(async () => {
  for (const org of [orgA, orgB]) {
    if (!org) continue;
    await db.query("delete from public.organizations where id = $1", [org.id]);
    // Supabase puede bloquear el borrado directo en storage.objects (se hace por
    // su API); son ficheros de prueba sin contenido, así que se ignora.
    await db
      .query("delete from storage.objects where name like $1", [`${org.id}/%`])
      .catch(() => undefined);
  }
  await db?.end();
});

describe("cobertura de RLS", () => {
  it("todas las tablas de public tienen RLS activado", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("todas las tablas de public tienen al menos una política", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
         and not exists (select 1 from pg_policies p
                         where p.schemaname = 'public' and p.tablename = c.relname)`,
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("anon no tiene acceso a ninguna tabla de public", async () => {
    const { rows } = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')`,
    );
    for (const { relname } of rows) {
      await expect(query(db, "anon", `select 1 from public.${relname} limit 1`)).rejects.toThrow(
        /permission denied/,
      );
    }
  });
});

describe("organizations", () => {
  it("cada miembro solo ve su empresa", async () => {
    for (const [user, org] of [
      [u.aAdmin, orgA],
      [u.aHr, orgA],
      [u.aEmp, orgA],
      [u.bAdmin, orgB],
      [u.bEmp, orgB],
    ] as const) {
      const rows = await query<{ id: string }>(db, user, "select id from public.organizations");
      expect(rows.map((r) => r.id)).toEqual([org.id]);
    }
  });

  it("un usuario sin empresa no ve ninguna", async () => {
    expect(await query(db, u.outsider, "select id from public.organizations")).toEqual([]);
  });

  it("solo el admin de la empresa puede editarla", async () => {
    const sql = "update public.organizations set legal_name = 'Nueva S.L.' where id = $1";
    expect(await exec(db, u.aAdmin, sql, [orgA.id])).toBe(1);
    expect(await exec(db, u.aHr, sql, [orgA.id])).toBe(0);
    expect(await exec(db, u.aEmp, sql, [orgA.id])).toBe(0);
    expect(await exec(db, u.aAdmin, sql, [orgB.id])).toBe(0);
  });

  it("el admin no puede tocar campos de plataforma (tope de IA, slug, demo)", async () => {
    for (const column of ["ai_monthly_budget_usd = 999", "slug = 'otro-slug'", "is_demo = true"]) {
      await expect(
        exec(db, u.aAdmin, `update public.organizations set ${column} where id = $1`, [orgA.id]),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("nadie puede insertar o borrar empresas directamente", async () => {
    await expect(
      exec(
        db,
        u.aAdmin,
        `insert into public.organizations (name, slug, country, timezone, currency)
         values ('X', 'x-directa', 'ES', 'Europe/Madrid', 'EUR')`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(db, u.aAdmin, "delete from public.organizations where id = $1", [orgA.id]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("memberships y perfiles", () => {
  it("el empleado solo ve su propia membresía", async () => {
    const rows = await query<{ user_id: string }>(
      db,
      u.aEmp,
      "select user_id from public.memberships",
    );
    expect(rows.map((r) => r.user_id)).toEqual([u.aEmp.id]);
  });

  it("RRHH ve las membresías de su empresa y ninguna de otra", async () => {
    const rows = await query<{ org_id: string }>(
      db,
      u.aHr,
      "select org_id from public.memberships",
    );
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.org_id))).toEqual(new Set([orgA.id]));
  });

  it("RRHH ve los perfiles de su empresa pero no los de otra", async () => {
    const rows = await query<{ id: string }>(db, u.aHr, "select id from public.profiles");
    expect(new Set(rows.map((r) => r.id))).toEqual(new Set([u.aAdmin.id, u.aHr.id, u.aEmp.id]));
  });

  it("el empleado solo ve su propio perfil", async () => {
    const rows = await query<{ id: string }>(db, u.aEmp, "select id from public.profiles");
    expect(rows.map((r) => r.id)).toEqual([u.aEmp.id]);
  });

  it("cada usuario edita solo su nombre (no su email)", async () => {
    const sql = "update public.profiles set full_name = 'Nombre Nuevo' where id = $1";
    expect(await exec(db, u.aEmp, sql, [u.aEmp.id])).toBe(1);
    expect(await exec(db, u.aEmp, sql, [u.aHr.id])).toBe(0);
    await expect(
      exec(db, u.aEmp, "update public.profiles set email = 'x@x.com' where id = $1", [u.aEmp.id]),
    ).rejects.toThrow(/permission denied/);
  });

  it("solo el admin cambia roles, y solo en su empresa", async () => {
    const sql = "update public.memberships set role = 'hr' where user_id = $1 and org_id = $2";
    expect(await exec(db, u.aHr, sql, [u.aEmp.id, orgA.id])).toBe(0);
    expect(await exec(db, u.bAdmin, sql, [u.aEmp.id, orgA.id])).toBe(0);
    expect(await exec(db, u.aAdmin, sql, [u.aEmp.id, orgA.id])).toBe(1);
    // Volvemos al estado inicial.
    await exec(
      db,
      u.aAdmin,
      "update public.memberships set role = 'employee' where user_id = $1 and org_id = $2",
      [u.aEmp.id, orgA.id],
    );
  });

  it("no se puede mover una membresía de empresa ni de usuario", async () => {
    await expect(
      exec(db, u.aAdmin, "update public.memberships set org_id = $1 where user_id = $2", [
        orgB.id,
        u.aEmp.id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("no se puede quitar al último admin activo", async () => {
    await expect(
      exec(
        db,
        u.aAdmin,
        "update public.memberships set role = 'hr' where user_id = $1 and org_id = $2",
        [u.aAdmin.id, orgA.id],
      ),
    ).rejects.toThrow(/al menos un administrador/);
    await expect(
      exec(
        db,
        u.aAdmin,
        "update public.memberships set status = 'disabled' where user_id = $1 and org_id = $2",
        [u.aAdmin.id, orgA.id],
      ),
    ).rejects.toThrow(/al menos un administrador/);
    await expect(
      exec(db, u.aAdmin, "delete from public.memberships where user_id = $1 and org_id = $2", [
        u.aAdmin.id,
        orgA.id,
      ]),
    ).rejects.toThrow(/al menos un administrador/);
  });

  it("un miembro desactivado pierde el acceso a la empresa", async () => {
    await exec(
      db,
      u.aAdmin,
      "update public.memberships set status = 'disabled' where user_id = $1 and org_id = $2",
      [u.aEmp.id, orgA.id],
    );
    expect(await query(db, u.aEmp, "select id from public.organizations")).toEqual([]);
    await exec(
      db,
      u.aAdmin,
      "update public.memberships set status = 'active' where user_id = $1 and org_id = $2",
      [u.aEmp.id, orgA.id],
    );
    expect(await query(db, u.aEmp, "select id from public.organizations")).toHaveLength(1);
  });
});

describe("invitaciones", () => {
  it("solo el admin ve y crea invitaciones de su empresa", async () => {
    expect((await query(db, u.aAdmin, "select id from public.invitations")).length).toBeGreaterThan(
      0,
    );
    expect(await query(db, u.aHr, "select id from public.invitations")).toEqual([]);
    expect(await query(db, u.aEmp, "select id from public.invitations")).toEqual([]);
    const adminBRows = await query<{ org_id: string }>(
      db,
      u.bAdmin,
      "select org_id from public.invitations",
    );
    expect(adminBRows.every((r) => r.org_id === orgB.id)).toBe(true);

    const { hash } = newInvitationToken();
    await expect(
      exec(
        db,
        u.aAdmin,
        "insert into public.invitations (org_id, email, role, token_hash) values ($1, 'x@y.com', 'hr', $2)",
        [orgB.id, hash],
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      exec(
        db,
        u.aHr,
        "insert into public.invitations (org_id, email, role, token_hash) values ($1, 'x@y.com', 'hr', $2)",
        [orgA.id, hash],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("nadie puede marcar una invitación como aceptada a mano", async () => {
    await expect(
      exec(db, u.aAdmin, "update public.invitations set accepted_at = now() where org_id = $1", [
        orgA.id,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("la invitación solo la acepta el email invitado, una vez y si no ha caducado", async () => {
    const { token, hash } = newInvitationToken();
    await exec(
      db,
      u.aAdmin,
      "insert into public.invitations (org_id, email, role, token_hash) values ($1, $2, 'hr', $3)",
      [orgA.id, u.outsider.email, hash],
    );
    // Otro usuario con el enlace no puede usarla.
    await expect(query(db, u.bEmp, "select public.accept_invitation($1)", [token])).rejects.toThrow(
      /otra dirección/,
    );
    // El destinatario sí.
    const [row] = await query<{ slug: string }>(
      db,
      u.outsider,
      "select public.accept_invitation($1) as slug",
      [token],
    );
    expect(row?.slug).toBe(orgA.slug);
    // No se puede reutilizar.
    await expect(
      query(db, u.outsider, "select public.accept_invitation($1)", [token]),
    ).rejects.toThrow(/ya se ha utilizado/);
    // Caducada.
    const expired = newInvitationToken();
    await exec(
      db,
      u.bAdmin,
      `insert into public.invitations (org_id, email, role, token_hash, expires_at)
       values ($1, $2, 'employee', $3, now() - interval '1 day')`,
      [orgB.id, u.outsider.email, expired.hash],
    );
    await expect(
      query(db, u.outsider, "select public.accept_invitation($1)", [expired.token]),
    ).rejects.toThrow(/caducado/);
    // Limpieza: el usuario ajeno vuelve a no pertenecer a ninguna empresa.
    await db.query("delete from public.memberships where user_id = $1", [u.outsider.id]);
  });

  it("el enlace de invitación se puede previsualizar sin sesión", async () => {
    const { token, hash } = newInvitationToken();
    await exec(
      db,
      u.aAdmin,
      "insert into public.invitations (org_id, email, role, token_hash) values ($1, 'preview@test.hrpilot.dev', 'employee', $2)",
      [orgA.id, hash],
    );
    const rows = await query<{ organization_name: string; status: string; role: string }>(
      db,
      "anon",
      "select * from public.get_invitation_preview($1)",
      [token],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        organization_name: "Empresa Alfa Test",
        status: "pending",
        role: "employee",
      }),
    ]);
    expect(
      await query(db, "anon", "select * from public.get_invitation_preview('token-falso')"),
    ).toEqual([]);
  });

  it("anon no puede crear empresas ni aceptar invitaciones", async () => {
    await expect(query(db, "anon", "select public.create_organization('X', 'ES')")).rejects.toThrow(
      /permission denied/,
    );
    await expect(query(db, "anon", "select public.accept_invitation('x')")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("auditoría y uso de IA", () => {
  it("el admin ve la auditoría de su empresa y no la de otra", async () => {
    const rows = await query<{ org_id: string; action: string }>(
      db,
      u.aAdmin,
      "select org_id, action from public.audit_events",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.org_id === orgA.id)).toBe(true);
    expect(rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(["organization.created", "member.added", "invitation.accepted"]),
    );
  });

  it("RRHH no ve eventos de gestión de usuarios y el empleado no ve nada", async () => {
    expect(await query(db, u.aHr, "select id from public.audit_events")).toEqual([]);
    expect(await query(db, u.aEmp, "select id from public.audit_events")).toEqual([]);
  });

  it("los cambios de rol quedan auditados con quién y cuándo", async () => {
    await exec(
      db,
      u.bAdmin,
      "update public.memberships set role = 'hr' where user_id = $1 and org_id = $2",
      [u.bEmp.id, orgB.id],
    );
    const rows = await query<{ actor_id: string; details: { from: string; to: string } }>(
      db,
      u.bAdmin,
      "select actor_id, details from public.audit_events where action = 'member.role_changed'",
    );
    expect(rows).toEqual([
      expect.objectContaining({
        actor_id: u.bAdmin.id,
        details: expect.objectContaining({ from: "employee", to: "hr" }),
      }),
    ]);
    await exec(
      db,
      u.bAdmin,
      "update public.memberships set role = 'employee' where user_id = $1 and org_id = $2",
      [u.bEmp.id, orgB.id],
    );
  });

  it("solo el admin ve el uso de IA de su empresa", async () => {
    const adminRows = await query<{ org_id: string }>(
      db,
      u.aAdmin,
      "select org_id from public.ai_usage",
    );
    expect(adminRows.map((r) => r.org_id)).toEqual([orgA.id]);
    expect(await query(db, u.aHr, "select id from public.ai_usage")).toEqual([]);
    expect(await query(db, u.aEmp, "select id from public.ai_usage")).toEqual([]);
  });

  it("los usuarios no pueden escribir en auditoría ni en uso de IA", async () => {
    await expect(
      exec(
        db,
        u.aAdmin,
        "insert into public.audit_events (org_id, action, entity_type) values ($1, 'x.y', 'z')",
        [orgA.id],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      exec(
        db,
        u.aAdmin,
        "insert into public.ai_usage (org_id, feature, provider, model, status) values ($1, 'f', 'p', 'm', 'ok')",
        [orgA.id],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("auditoría y uso de IA son de solo inserción incluso para service_role", async () => {
    await expect(
      exec(db, "service_role", "update public.audit_events set action = 'x.y' where org_id = $1", [
        orgA.id,
      ]),
    ).rejects.toThrow(/solo inserción/);
    await expect(
      exec(db, "service_role", "delete from public.audit_events where org_id = $1", [orgA.id]),
    ).rejects.toThrow(/solo inserción/);
    await expect(
      exec(db, "service_role", "delete from public.ai_usage where org_id = $1", [orgA.id]),
    ).rejects.toThrow(/solo inserción/);
    await expect(db.query("truncate public.audit_events")).rejects.toThrow(/solo inserción/);
  });

  it("el gasto de IA del mes solo lo consulta el servidor", async () => {
    await expect(
      query(db, u.aAdmin, "select public.org_ai_spend_current_month($1)", [orgA.id]),
    ).rejects.toThrow(/permission denied/);
    const [row] = await query<{ spend: string }>(
      db,
      "service_role",
      "select public.org_ai_spend_current_month($1) as spend",
      [orgA.id],
    );
    expect(Number(row?.spend)).toBeCloseTo(0.01);
  });
});

describe("Storage", () => {
  const visible = async (user: TestUser, bucket: string) =>
    (
      await query<{ name: string }>(
        db,
        user,
        "select name from storage.objects where bucket_id = $1 and name like any ($2)",
        [bucket, [`${orgA.id}/%`, `${orgB.id}/%`]],
      )
    ).map((r) => r.name.split("/")[0]);

  it("un fichero de CV que no pertenece a ninguna candidatura no lo ve nadie", async () => {
    // La visibilidad por candidatura (y el modo anónimo) se prueba en candidates.test.ts.
    expect(await visible(u.aHr, "cvs")).toEqual([]);
    expect(await visible(u.aAdmin, "cvs")).toEqual([]);
    expect(await visible(u.aEmp, "cvs")).toEqual([]);
    expect(await visible(u.bHr, "cvs")).toEqual([]);
  });

  it("los documentos de la FAQ los ve cualquier miembro, solo de su empresa", async () => {
    expect(await visible(u.aEmp, "kb-documents")).toEqual([orgA.id]);
    expect(await visible(u.bEmp, "kb-documents")).toEqual([orgB.id]);
    expect(await visible(u.outsider, "kb-documents")).toEqual([]);
  });

  it("las fuentes de formación solo las ve RRHH de la propia empresa", async () => {
    expect(await visible(u.aHr, "training-sources")).toEqual([orgA.id]);
    expect(await visible(u.aEmp, "training-sources")).toEqual([]);
  });

  it("no se puede subir a la carpeta de otra empresa ni con rutas manipuladas", async () => {
    const insert = "insert into storage.objects (bucket_id, name) values ($1, $2)";
    // Los CVs solo los sube el servidor (URL firmada): nadie escribe directamente.
    await expect(exec(db, u.aHr, insert, ["cvs", `${orgA.id}/nuevo.pdf`])).rejects.toThrow(
      /row-level security/,
    );
    await expect(exec(db, u.aHr, insert, ["cvs", `${orgB.id}/intruso.pdf`])).rejects.toThrow(
      /row-level security/,
    );
    await expect(exec(db, u.aHr, insert, ["cvs", "sin-empresa/intruso.pdf"])).rejects.toThrow(
      /row-level security/,
    );
    expect(await exec(db, u.aHr, insert, ["training-sources", `${orgA.id}/nuevo.pdf`])).toBe(1);
    await expect(
      exec(db, u.aEmp, insert, ["kb-documents", `${orgA.id}/del-empleado.pdf`]),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("borrado completo de una empresa", () => {
  it("borra en cascada membresías, invitaciones y auditoría", async () => {
    const admin = await createUser(db, "tmpAdmin");
    const org = await createOrganization(db, admin, "Empresa Temporal", "ES");
    await db.query("delete from public.organizations where id = $1", [org.id]);
    const { rows } = await db.query(
      `select (select count(*) from public.memberships where org_id = $1)::int as m,
              (select count(*) from public.audit_events where org_id = $1)::int as a`,
      [org.id],
    );
    expect(rows[0]).toEqual({ m: 0, a: 0 });
  });

  it("dos empresas con el mismo nombre reciben slugs distintos", async () => {
    const admin = await createUser(db, "slugAdmin");
    const first = await createOrganization(db, admin, "Café Ñandú", "CR");
    const second = await createOrganization(db, admin, "Café Ñandú", "CR");
    expect(first.slug).toBe("cafe-nandu");
    expect(second.slug).toMatch(/^cafe-nandu-[a-f0-9]{5}$/);
    await db.query("delete from public.organizations where id = any($1)", [[first.id, second.id]]);
  });
});

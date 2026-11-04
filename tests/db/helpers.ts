import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";

export const DB_URL =
  process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export type TestUser = { id: string; email: string; label: string };

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

/** Crea un usuario directamente en auth.users (el trigger crea su perfil). */
export async function createUser(db: Client, label: string): Promise<TestUser> {
  const id = randomUUID();
  const email = `${label}-${id.slice(0, 8)}@test.hrpilot.dev`;
  await db.query(
    `insert into auth.users (id, email, aud, role, raw_user_meta_data, raw_app_meta_data)
     values ($1, $2, 'authenticated', 'authenticated', $3, '{"provider":"email","providers":["email"]}')`,
    [id, email, JSON.stringify({ full_name: label })],
  );
  return { id, email, label };
}

export type Actor = TestUser | "anon" | "service_role";

/**
 * Ejecuta `fn` en una transacción impersonando al actor, igual que hace
 * PostgREST: `set local role` + claims del JWT en `request.jwt.claims`.
 */
export async function as<T>(db: Client, actor: Actor, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    if (actor === "anon") {
      await db.query("set local role anon");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role: "anon" }),
      ]);
    } else if (actor === "service_role") {
      await db.query("set local role service_role");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ role: "service_role" }),
      ]);
    } else {
      await db.query("set local role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({
          sub: actor.id,
          email: actor.email,
          role: "authenticated",
          aud: "authenticated",
        }),
      ]);
    }
    const result = await fn();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

/** Ejecuta una consulta como el actor y devuelve las filas. */
export async function query<R extends Record<string, unknown> = Record<string, unknown>>(
  db: Client,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return as(db, actor, async () => (await db.query<R>(sql, params)).rows);
}

/** Ejecuta una sentencia como el actor y devuelve el número de filas afectadas. */
export async function exec(
  db: Client,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<number> {
  return as(db, actor, async () => (await db.query(sql, params)).rowCount ?? 0);
}

export function newInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

export type Org = { id: string; slug: string };

export async function createOrganization(
  db: Client,
  admin: TestUser,
  name: string,
  country: "ES" | "CR",
): Promise<Org> {
  const rows = await query<{ id: string; slug: string }>(
    db,
    admin,
    "select id, slug from public.create_organization($1, $2)",
    [name, country],
  );
  const org = rows[0];
  if (!org) throw new Error("create_organization no devolvió fila");
  return org;
}

/** Invita (como admin) y acepta (como el invitado): el flujo real de alta. */
export async function inviteAndAccept(
  db: Client,
  admin: TestUser,
  org: Org,
  user: TestUser,
  role: "admin" | "hr" | "employee",
): Promise<void> {
  const { token, hash } = newInvitationToken();
  await exec(
    db,
    admin,
    "insert into public.invitations (org_id, email, role, token_hash) values ($1, $2, $3, $4)",
    [org.id, user.email, role, hash],
  );
  await query(db, user, "select public.accept_invitation($1) as slug", [token]);
}

/**
 * Datos de ejemplo: una empresa demo española y otra costarricense, cada una con
 * admin, RRHH y empleado. Idempotente: se puede ejecutar varias veces.
 *
 *   pnpm db:seed            (usa .env.local; requiere Supabase en marcha)
 *
 * SOLO para desarrollo y demos: las contraseñas son conocidas.
 */
import { loadEnvConfig } from "@next/env";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD ?? "Demo1234";

if (!url || !anonKey || !secretKey) {
  console.error("Faltan variables de Supabase. Ejecuta `pnpm env:local` con Supabase en marcha.");
  process.exit(1);
}

type Role = "admin" | "hr" | "employee";
type DemoOrg = {
  name: string;
  country: "ES" | "CR";
  legalName: string;
  taxId: string;
  address: string;
  domain: string;
  people: Record<Role, string>;
};

const DEMO_ORGS: DemoOrg[] = [
  {
    name: "Logística Iberia (Demo)",
    country: "ES",
    legalName: "Logística Iberia Demo S.L.",
    taxId: "B00000000",
    address: "Calle Ficticia 1, 28001 Madrid",
    domain: "demo-es.example.com",
    people: { admin: "Lucía Admin", hr: "Marta RRHH", employee: "Javier Empleado" },
  },
  {
    name: "Café Volcán (Demo)",
    country: "CR",
    legalName: "Café Volcán Demo S.A.",
    taxId: "3-101-000000",
    address: "Avenida Ficticia, San José",
    domain: "demo-cr.example.com",
    people: { admin: "Andrea Admin", hr: "Carlos RRHH", employee: "Sofía Empleada" },
  },
];

const EMAIL_PREFIX: Record<Role, string> = { admin: "admin", hr: "rrhh", employee: "empleado" };

const admin: SupabaseClient<Database> = createClient<Database>(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureUser(email: string, fullName: string): Promise<string> {
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (profile) return profile.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`No se pudo crear ${email}: ${error?.message}`);
  return data.user.id;
}

async function ensureOrg(org: DemoOrg, adminEmail: string): Promise<string> {
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("name", org.name)
    .eq("is_demo", true)
    .maybeSingle();
  if (existing) return existing.id;

  // La empresa la crea su admin (RPC con su sesión), como en la app.
  const userClient = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } });
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email: adminEmail,
    password,
  });
  if (signInError)
    throw new Error(`No se pudo iniciar sesión como ${adminEmail}: ${signInError.message}`);
  const { data: created, error } = await userClient.rpc("create_organization", {
    p_name: org.name,
    p_country: org.country,
    p_legal_name: org.legalName,
    p_tax_id: org.taxId,
    p_address: org.address,
    p_privacy_email: `privacidad@${org.domain}`,
  });
  if (error || !created) throw new Error(`No se pudo crear ${org.name}: ${error?.message}`);
  await admin.from("organizations").update({ is_demo: true }).eq("id", created.id);
  return created.id;
}

async function ensureMembership(orgId: string, userId: string, role: Role) {
  const { data: existing } = await admin
    .from("memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return;
  const { error } = await admin
    .from("memberships")
    .insert({ org_id: orgId, user_id: userId, role });
  if (error) throw new Error(`No se pudo añadir la membresía: ${error.message}`);
}

async function main() {
  for (const org of DEMO_ORGS) {
    const ids = {} as Record<Role, string>;
    for (const role of ["admin", "hr", "employee"] as const) {
      ids[role] = await ensureUser(`${EMAIL_PREFIX[role]}@${org.domain}`, org.people[role]);
    }
    const orgId = await ensureOrg(org, `admin@${org.domain}`);
    await ensureMembership(orgId, ids.hr, "hr");
    await ensureMembership(orgId, ids.employee, "employee");
    console.log(`✓ ${org.name}`);
    for (const role of ["admin", "hr", "employee"] as const) {
      console.log(`   ${role.padEnd(8)} ${EMAIL_PREFIX[role]}@${org.domain}`);
    }
  }
  console.log(`\nContraseña de todas las cuentas demo: ${password}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

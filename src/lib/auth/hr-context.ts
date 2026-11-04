import "server-only";
import type { AiCallContext } from "@/lib/ai";
import { getCountryOrDefault } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";
import { ALL_ROLES, HR_ROLES, type MemberRole } from "./roles";
import { requireUser } from "./session";

/**
 * Contexto para Server Actions y rutas sobre una empresa concreta: usuario,
 * empresa, rol, país, cliente con su sesión y contexto de IA. Devuelve null si
 * la persona no tiene una membresía activa con uno de los roles pedidos (la RLS
 * lo vuelve a comprobar en cada consulta).
 */
export async function requireRoleContext(orgId: string, roles: readonly MemberRole[]) {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: org }, { data: membership }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, country").eq("id", orgId).maybeSingle(),
    supabase
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (!org || !membership || !roles.includes(membership.role)) return null;
  const country = getCountryOrDefault(org.country);
  const aiContext: AiCallContext = {
    orgId: org.id,
    userId: user.id,
    organizationName: org.name,
    country,
  };
  return { user, org, role: membership.role, country, supabase, aiContext };
}

/** Admin o RRHH activos de la empresa. */
export function requireHrContext(orgId: string) {
  return requireRoleContext(orgId, HR_ROLES);
}

/** Cualquier miembro activo de la empresa (p. ej. la FAQ o las formaciones asignadas). */
export function requireMemberContext(orgId: string) {
  return requireRoleContext(orgId, ALL_ROLES);
}

export type HrContext = NonNullable<Awaited<ReturnType<typeof requireRoleContext>>>;
export type MemberContext = HrContext;

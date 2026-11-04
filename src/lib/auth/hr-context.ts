import "server-only";
import type { AiCallContext } from "@/lib/ai";
import { getCountryOrDefault } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";
import { HR_ROLES } from "./roles";
import { requireUser } from "./session";

/**
 * Contexto para Server Actions de RRHH sobre una empresa concreta: usuario,
 * empresa, país, cliente con su sesión y contexto de IA. Devuelve null si la
 * persona no es admin ni RRHH activa de esa empresa (la RLS lo vuelve a comprobar
 * en cada consulta).
 */
export async function requireHrContext(orgId: string) {
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
  if (!org || !membership || !HR_ROLES.includes(membership.role)) return null;
  const country = getCountryOrDefault(org.country);
  const aiContext: AiCallContext = {
    orgId: org.id,
    userId: user.id,
    organizationName: org.name,
    country,
  };
  return { user, org, country, supabase, aiContext };
}

export type HrContext = NonNullable<Awaited<ReturnType<typeof requireHrContext>>>;

import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { type CountryConfig, getCountryOrDefault } from "@/lib/countries";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole } from "./roles";

/** Usuario autenticado (validado contra Supabase Auth, no solo la cookie). */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export async function requireUser(nextPath?: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");
  }
  return user;
}

export type MyMembership = {
  membershipId: string;
  role: MemberRole;
  organization: Pick<Tables<"organizations">, "id" | "name" | "slug" | "country">;
};

/** Empresas en las que el usuario tiene una membresía activa. */
export const getMyMemberships = cache(async (): Promise<MyMembership[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("id, role, organizations!inner(id, name, slug, country)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar tus empresas: ${error.message}`);
  return (data ?? []).map((row) => ({
    membershipId: row.id,
    role: row.role,
    organization: row.organizations,
  }));
});

export type OrgContext = {
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  org: Tables<"organizations">;
  role: MemberRole;
  membershipId: string;
  country: CountryConfig;
};

/**
 * Contexto de la empresa de la URL. Si el usuario no es miembro activo devuelve
 * 404 (no se revela si la empresa existe). RLS garantiza lo mismo en los datos.
 */
export const getOrgContext = cache(async (slug: string): Promise<OrgContext> => {
  const user = await requireUser(`/app/${slug}`);
  const supabase = await createClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("id, role")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) notFound();

  return {
    user,
    org,
    role: membership.role,
    membershipId: membership.id,
    country: getCountryOrDefault(org.country),
  };
});

/** Exige uno de los roles indicados; si no, 404. */
export async function requireOrgRole(
  slug: string,
  roles: readonly MemberRole[],
): Promise<OrgContext> {
  const context = await getOrgContext(slug);
  if (!roles.includes(context.role)) notFound();
  return context;
}

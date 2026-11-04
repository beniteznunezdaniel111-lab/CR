import "server-only";
import { requireRoleContext } from "@/lib/auth/hr-context";
import type { MemberRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

/** Contexto de la empresa de la URL (por slug) si la persona tiene uno de los roles. */
export async function roleContextBySlug(slug: string, roles: readonly MemberRole[]) {
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) return null;
  return requireRoleContext(org.id, roles);
}

/** Nombre de fichero seguro: letras, números y guiones. */
export function exportFilename(prefix: string, label: string): string {
  const base =
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^\w-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60)
      .toLowerCase() || "datos";
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}-${base}-${date}.json`;
}

import "server-only";
import type { MemberRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type InvitationPreview = {
  organizationName: string;
  role: MemberRole;
  email: string;
  status: "pending" | "accepted" | "revoked" | "expired";
};

/** Datos públicos de una invitación a partir del token (RPC accesible sin sesión). */
export async function getInvitationPreview(token: string): Promise<InvitationPreview | null> {
  if (!token || token.length > 200) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_invitation_preview", { p_token: token });
  if (error || !data?.[0]) return null;
  const row = data[0];
  return {
    organizationName: row.organization_name,
    role: row.role,
    email: row.email,
    status: row.status as InvitationPreview["status"],
  };
}

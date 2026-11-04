import "server-only";
import type { MemberRole, MemberStatus } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type MemberRow = {
  membershipId: string;
  userId: string;
  fullName: string | null;
  email: string | null;
  role: MemberRole;
  status: MemberStatus;
  joinedAt: string;
};

export type PendingInvitationRow = {
  id: string;
  email: string;
  role: MemberRole;
  expiresAt: string;
  createdAt: string;
  expired: boolean;
};

export async function listMembers(orgId: string): Promise<MemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("id, user_id, role, status, created_at, profiles(full_name, email)")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`No se pudieron cargar los usuarios: ${error.message}`);
  return (data ?? []).map((row) => ({
    membershipId: row.id,
    userId: row.user_id,
    fullName: row.profiles?.full_name ?? null,
    email: row.profiles?.email ?? null,
    role: row.role,
    status: row.status,
    joinedAt: row.created_at,
  }));
}

export async function listPendingInvitations(orgId: string): Promise<PendingInvitationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, expires_at, created_at")
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las invitaciones: ${error.message}`);
  const now = Date.now();
  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    expired: new Date(row.expires_at).getTime() < now,
  }));
}

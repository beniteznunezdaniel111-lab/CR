import type { Enums } from "@/lib/supabase/database.types";

export type MemberRole = Enums<"member_role">;
export type MemberStatus = Enums<"member_status">;

export const ROLES: readonly MemberRole[] = ["admin", "hr", "employee"];
export const HR_ROLES: readonly MemberRole[] = ["admin", "hr"];
export const ADMIN_ROLES: readonly MemberRole[] = ["admin"];
export const ALL_ROLES: readonly MemberRole[] = ROLES;

export function isMemberRole(value: unknown): value is MemberRole {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Admin tiene todo lo de RRHH. */
export function isHrRole(role: MemberRole): boolean {
  return role === "admin" || role === "hr";
}

export function isAdminRole(role: MemberRole): boolean {
  return role === "admin";
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/session";
import { getSiteUrl } from "@/lib/config/public-env";
import { sendEmail } from "@/lib/email";
import { invitationEmail } from "@/lib/email/templates";
import { type FormState, formDataToObject, zodFieldErrors } from "@/lib/forms";
import {
  INVITATION_TTL_DAYS,
  generateInvitationToken,
  invitationExpiry,
} from "@/lib/invitations/token";
import { createClient } from "@/lib/supabase/server";
import {
  changeRoleSchema,
  invitationIdSchema,
  inviteMemberSchema,
  membershipIdSchema,
  setStatusSchema,
} from "./schemas";

export type InvitationLinkResult = { link: string; emailSent: boolean };

/** Comprueba que el usuario actual es admin activo de la empresa (RLS lo exige igualmente). */
async function requireAdminOf(orgId: string) {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: org }, { data: me }] = await Promise.all([
    supabase.from("organizations").select("id, name, slug").eq("id", orgId).maybeSingle(),
    supabase
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (!org || me?.role !== "admin") return null;
  return { user, org, supabase };
}

function revalidateMembers(slug: string) {
  revalidatePath(`/app/${slug}/settings/members`);
}

export async function inviteMemberAction(
  _prev: FormState<InvitationLinkResult>,
  formData: FormData,
): Promise<FormState<InvitationLinkResult>> {
  const t = await getTranslations("members");
  const parsed = inviteMemberSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  const { orgId, email, role } = parsed.data;

  const admin = await requireAdminOf(orgId);
  if (!admin) return { status: "error", message: t("forbidden") };
  const { supabase, org, user } = admin;

  const { data: existing } = await supabase
    .from("memberships")
    .select("id, status, profiles!inner(email)")
    .eq("org_id", orgId)
    .eq("profiles.email", email)
    .maybeSingle();
  if (existing?.status === "active") {
    return { status: "error", fieldErrors: { email: ["alreadyMember"] } };
  }

  // Una sola invitación pendiente por email: se revocan las anteriores.
  await supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const { token, hash } = generateInvitationToken();
  const { error } = await supabase.from("invitations").insert({
    org_id: orgId,
    email,
    role,
    token_hash: hash,
    expires_at: invitationExpiry().toISOString(),
  });
  if (error) return { status: "error", message: t("inviteError") };

  const link = `${getSiteUrl()}/invite/${token}`;
  const tRoles = await getTranslations("roles");
  const { data: inviter } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const { sent } = await sendEmail({
    to: email,
    ...invitationEmail({
      organizationName: org.name,
      roleLabel: tRoles(role),
      inviterName: inviter?.full_name ?? null,
      link,
      expiresInDays: INVITATION_TTL_DAYS,
    }),
  });

  revalidateMembers(org.slug);
  return { status: "success", data: { link, emailSent: sent } };
}

export async function revokeInvitationAction(formData: FormData): Promise<FormState> {
  const t = await getTranslations("members");
  const parsed = invitationIdSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("genericError") };
  const admin = await requireAdminOf(parsed.data.orgId);
  if (!admin) return { status: "error", message: t("forbidden") };

  const { error } = await admin.supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.invitationId)
    .eq("org_id", parsed.data.orgId);
  if (error) return { status: "error", message: t("genericError") };
  revalidateMembers(admin.org.slug);
  return { status: "success", message: t("invitationRevoked") };
}

export async function regenerateInvitationLinkAction(
  formData: FormData,
): Promise<FormState<InvitationLinkResult>> {
  const t = await getTranslations("members");
  const parsed = invitationIdSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("genericError") };
  const admin = await requireAdminOf(parsed.data.orgId);
  if (!admin) return { status: "error", message: t("forbidden") };

  const { token, hash } = generateInvitationToken();
  const { data, error } = await admin.supabase
    .from("invitations")
    .update({ token_hash: hash, expires_at: invitationExpiry().toISOString() })
    .eq("id", parsed.data.invitationId)
    .eq("org_id", parsed.data.orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error || !data) return { status: "error", message: t("genericError") };
  revalidateMembers(admin.org.slug);
  return { status: "success", data: { link: `${getSiteUrl()}/invite/${token}`, emailSent: false } };
}

function mapMembershipError(code: string | undefined, t: (key: string) => string): string {
  return code === "P0001" ? t("lastAdmin") : t("genericError");
}

export async function changeMemberRoleAction(formData: FormData): Promise<FormState> {
  const t = await getTranslations("members");
  const parsed = changeRoleSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("genericError") };
  const admin = await requireAdminOf(parsed.data.orgId);
  if (!admin) return { status: "error", message: t("forbidden") };

  const { error } = await admin.supabase
    .from("memberships")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.membershipId)
    .eq("org_id", parsed.data.orgId);
  if (error) return { status: "error", message: mapMembershipError(error.code, t) };
  revalidateMembers(admin.org.slug);
  return { status: "success", message: t("roleChanged") };
}

export async function setMemberStatusAction(formData: FormData): Promise<FormState> {
  const t = await getTranslations("members");
  const parsed = setStatusSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("genericError") };
  const admin = await requireAdminOf(parsed.data.orgId);
  if (!admin) return { status: "error", message: t("forbidden") };

  const { error } = await admin.supabase
    .from("memberships")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.membershipId)
    .eq("org_id", parsed.data.orgId);
  if (error) return { status: "error", message: mapMembershipError(error.code, t) };
  revalidateMembers(admin.org.slug);
  return {
    status: "success",
    message: parsed.data.status === "active" ? t("memberEnabled") : t("memberDisabled"),
  };
}

export async function removeMemberAction(formData: FormData): Promise<FormState> {
  const t = await getTranslations("members");
  const parsed = membershipIdSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", message: t("genericError") };
  const admin = await requireAdminOf(parsed.data.orgId);
  if (!admin) return { status: "error", message: t("forbidden") };

  const { error } = await admin.supabase
    .from("memberships")
    .delete()
    .eq("id", parsed.data.membershipId)
    .eq("org_id", parsed.data.orgId);
  if (error) return { status: "error", message: mapMembershipError(error.code, t) };
  revalidateMembers(admin.org.slug);
  return { status: "success", message: t("memberRemoved") };
}

/** Errores de accept_invitation() que se pueden mostrar tal cual (son nuestros). */
const USER_FACING_RPC_CODES = new Set(["P0001", "P0002", "42501"]);

export async function acceptInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("invite");
  const token = String(formData.get("token") ?? "");
  await requireUser(`/invite/${token}`);
  const supabase = await createClient();
  const { data: slug, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !slug) {
    return {
      status: "error",
      message: error && USER_FACING_RPC_CODES.has(error.code) ? error.message : t("error"),
    };
  }
  redirect(`/app/${slug}`);
}

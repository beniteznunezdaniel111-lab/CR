"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSiteUrl } from "@/lib/config/public-env";
import { type FormState, formDataToObject, zodFieldErrors } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { getInvitationPreview } from "@/modules/members/invitation-preview";
import { isAccessCodeRequired, isValidAccessCode } from "./access-code";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  safeNextPath,
  signupSchema,
} from "./schemas";

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("auth");
  const parsed = loginSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return {
      status: "error",
      message:
        error.code === "email_not_confirmed"
          ? t("login.emailNotConfirmed")
          : t("login.invalidCredentials"),
    };
  }
  redirect(safeNextPath(parsed.data.next));
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("auth");
  const parsed = signupSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };
  const { fullName, email, password, accessCode, invite } = parsed.data;

  // Con una invitación válida para este email no hace falta código de acceso.
  let invitedTo: string | null = null;
  if (invite) {
    const preview = await getInvitationPreview(invite);
    if (preview?.status === "pending" && preview.email.toLowerCase() === email) {
      invitedTo = invite;
    }
  }
  if (!invitedTo && isAccessCodeRequired() && !isValidAccessCode(accessCode)) {
    return { status: "error", fieldErrors: { accessCode: ["accessCode"] } };
  }

  const next = invitedTo ? `/invite/${invitedTo}` : "/app";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { status: "error", message: t("signup.emailTaken") };
    }
    if (error.code === "weak_password") {
      return { status: "error", fieldErrors: { password: ["passwordMin"] } };
    }
    return { status: "error", message: t("signup.genericError") };
  }

  // Sin confirmación de email (desarrollo) Supabase devuelve ya la sesión.
  if (data.session) redirect(next);
  return { status: "success", message: t("signup.checkEmail") };
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("auth");
  const parsed = forgotPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=/reset-password`,
  });
  // Misma respuesta exista o no la cuenta (no revelamos qué emails existen).
  return { status: "success", message: t("forgot.sent") };
}

export async function updatePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations("auth");
  const parsed = resetPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", fieldErrors: zodFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { status: "error", message: t("reset.error") };
  redirect("/app");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

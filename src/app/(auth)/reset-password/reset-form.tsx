"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/forms";
import { updatePasswordAction } from "@/modules/auth/actions";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(updatePasswordAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">{t("reset.newPassword")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
        <p className="text-xs text-muted-foreground">{t("passwordHelp")}</p>
        <FieldError messages={fieldErrors?.password} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t("reset.confirmPassword")}</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
        <FieldError messages={fieldErrors?.confirmPassword} />
      </div>
      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <SubmitButton className="w-full" pendingLabel={t("reset.pending")}>
        {t("reset.submit")}
      </SubmitButton>
    </form>
  );
}

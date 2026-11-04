"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState, valuesFrom } from "@/lib/forms";
import { requestPasswordResetAction } from "@/modules/auth/actions";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(requestPasswordResetAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const values = valuesFrom(state);

  if (state.status === "success") return <FormMessage status="success" message={state.message} />;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={values.email}
        />
        <FieldError messages={fieldErrors?.email} />
      </div>
      <SubmitButton className="w-full" pendingLabel={t("forgot.pending")}>
        {t("forgot.submit")}
      </SubmitButton>
    </form>
  );
}

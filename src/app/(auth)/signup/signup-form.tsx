"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState, valuesFrom } from "@/lib/forms";
import { signUpAction } from "@/modules/auth/actions";

type Props = {
  requireAccessCode: boolean;
  invite?: { token: string; email: string };
};

export function SignupForm({ requireAccessCode, invite }: Props) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(signUpAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const values = valuesFrom(state);

  if (state.status === "success") {
    return <FormMessage status="success" message={state.message} />;
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {invite ? <input type="hidden" name="invite" value={invite.token} /> : null}
      <div className="space-y-2">
        <Label htmlFor="fullName">{t("fullName")}</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          defaultValue={values.fullName}
          aria-invalid={Boolean(fieldErrors?.fullName)}
        />
        <FieldError messages={fieldErrors?.fullName} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={invite?.email ?? values.email}
          readOnly={Boolean(invite)}
          aria-invalid={Boolean(fieldErrors?.email)}
        />
        <FieldError messages={fieldErrors?.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-describedby="password-help"
          aria-invalid={Boolean(fieldErrors?.password)}
        />
        <p id="password-help" className="text-xs text-muted-foreground">
          {t("passwordHelp")}
        </p>
        <FieldError messages={fieldErrors?.password} />
      </div>
      {requireAccessCode && !invite ? (
        <div className="space-y-2">
          <Label htmlFor="accessCode">{t("accessCode")}</Label>
          <Input
            id="accessCode"
            name="accessCode"
            autoComplete="off"
            required
            defaultValue={values.accessCode}
            aria-describedby="access-code-help"
            aria-invalid={Boolean(fieldErrors?.accessCode)}
          />
          <p id="access-code-help" className="text-xs text-muted-foreground">
            {t("accessCodeHelp")}
          </p>
          <FieldError messages={fieldErrors?.accessCode} />
        </div>
      ) : null}
      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="acceptTerms"
            defaultChecked={values.acceptTerms === "on"}
            className="mt-0.5 size-4 accent-primary"
            aria-invalid={Boolean(fieldErrors?.acceptTerms)}
          />
          <span>
            {t.rich("signup.acceptTerms", {
              terms: (chunks) => (
                <Link href="/legal/terms" target="_blank" className="text-primary hover:underline">
                  {chunks}
                </Link>
              ),
              privacy: (chunks) => (
                <Link
                  href="/legal/privacy"
                  target="_blank"
                  className="text-primary hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        <FieldError messages={fieldErrors?.acceptTerms} />
      </div>
      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <SubmitButton className="w-full" pendingLabel={t("signup.pending")}>
        {t("signup.submit")}
      </SubmitButton>
    </form>
  );
}

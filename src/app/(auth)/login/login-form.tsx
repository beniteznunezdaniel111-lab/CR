"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState, valuesFrom } from "@/lib/forms";
import { signInAction } from "@/modules/auth/actions";

export function LoginForm({ next, defaultEmail }: { next?: string; defaultEmail?: string }) {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(signInAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const values = valuesFrom(state);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="space-y-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={values.email ?? defaultEmail}
          required
          aria-invalid={Boolean(fieldErrors?.email)}
        />
        <FieldError messages={fieldErrors?.email} />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t("password")}</Label>
          <Link href="/forgot-password" className="text-sm text-primary hover:underline">
            {t("login.forgot")}
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(fieldErrors?.password)}
        />
        <FieldError messages={fieldErrors?.password} />
      </div>
      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <SubmitButton className="w-full" pendingLabel={t("login.pending")}>
        {t("login.submit")}
      </SubmitButton>
    </form>
  );
}

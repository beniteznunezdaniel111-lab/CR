"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { idleState } from "@/lib/forms";
import { acceptInvitationAction } from "@/modules/members/actions";

export function AcceptInvitationForm({ token }: { token: string }) {
  const t = useTranslations("invite");
  const [state, formAction] = useActionState(acceptInvitationAction, idleState);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <SubmitButton className="w-full" pendingLabel={t("accepting")}>
        {t("accept")}
      </SubmitButton>
    </form>
  );
}

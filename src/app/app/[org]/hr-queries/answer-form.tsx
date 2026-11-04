"use client";

import { SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idleState, valuesFrom } from "@/lib/forms";
import { answerHrQueryAction } from "@/modules/faq/actions";

/** Respuesta de RRHH a una consulta (avisa a quien preguntó). */
export function AnswerForm({ orgId, queryId }: { orgId: string; queryId: string }) {
  const t = useTranslations("hrQueries.queries");
  const [state, formAction] = useActionState(answerHrQueryAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const id = useId();
  return (
    <form action={formAction} className="space-y-2" noValidate>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="queryId" value={queryId} />
      <Label htmlFor={id}>{t("answerLabel")}</Label>
      <Textarea
        id={id}
        name="answer"
        rows={3}
        defaultValue={valuesFrom(state).answer}
        aria-invalid={Boolean(fieldErrors?.answer)}
      />
      <FieldError messages={fieldErrors?.answer} />
      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <SubmitButton size="sm">
        <SendIcon aria-hidden />
        {t("submit")}
      </SubmitButton>
    </form>
  );
}

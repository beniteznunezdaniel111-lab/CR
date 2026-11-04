"use client";

import { useTranslations } from "next-intl";
import { useActionState, useId } from "react";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idleState, valuesFrom } from "@/lib/forms";
import { updateTrainingInfoAction } from "@/modules/trainings/actions";

export function TrainingInfoForm({
  orgId,
  trainingId,
  title,
  description,
  audience,
}: {
  orgId: string;
  trainingId: string;
  title: string;
  description: string;
  audience: string;
}) {
  const t = useTranslations("trainings.editor");
  const [state, formAction] = useActionState(updateTrainingInfoAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const values = valuesFrom(state);
  const ids = { title: useId(), description: useId(), audience: useId() };
  return (
    <form action={formAction} className="space-y-3" noValidate>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="trainingId" value={trainingId} />
      <div className="space-y-1">
        <Label htmlFor={ids.title}>{t("titleLabel")}</Label>
        <Input
          id={ids.title}
          name="title"
          defaultValue={values.title ?? title}
          aria-invalid={Boolean(fieldErrors?.title)}
        />
        <FieldError messages={fieldErrors?.title} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={ids.description}>{t("descriptionLabel")}</Label>
        <Textarea
          id={ids.description}
          name="description"
          rows={3}
          defaultValue={values.description ?? description}
        />
        <FieldError messages={fieldErrors?.description} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={ids.audience}>{t("audienceLabel")}</Label>
        <Input id={ids.audience} name="audience" defaultValue={values.audience ?? audience} />
      </div>
      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <SubmitButton size="sm">{t("save")}</SubmitButton>
    </form>
  );
}

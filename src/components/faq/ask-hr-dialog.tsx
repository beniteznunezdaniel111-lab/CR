"use client";

import { SendIcon, UserRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { toast } from "sonner";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, idleState, valuesFrom } from "@/lib/forms";
import { createHrQueryAction } from "@/modules/faq/actions";

/** Envía una consulta a RRHH (con la pregunta del chat ya escrita, si la hay). */
export function AskHrDialog({
  orgId,
  question = "",
  variant = "outline",
  label,
}: {
  orgId: string;
  question?: string;
  variant?: "outline" | "default" | "secondary";
  label?: string;
}) {
  const t = useTranslations("faq.askHr");
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      const result = await createHrQueryAction(previous, formData);
      if (result.status === "success") {
        toast.success(result.message ?? t("sent"));
        setOpen(false);
        return idleState;
      }
      return result;
    },
    idleState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const id = useId();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm">
          <UserRoundIcon aria-hidden />
          {label ?? t("title")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="orgId" value={orgId} />
          <div className="space-y-2">
            <Label htmlFor={id}>{t("questionLabel")}</Label>
            <Textarea
              id={id}
              name="question"
              rows={4}
              defaultValue={valuesFrom(state).question ?? question}
              aria-invalid={Boolean(fieldErrors?.question)}
            />
            <FieldError messages={fieldErrors?.question} />
          </div>
          <FormMessage
            status={state.status}
            message={state.status === "error" ? state.message : undefined}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t("cancel")}
              </Button>
            </DialogClose>
            <SubmitButton>
              <SendIcon aria-hidden />
              {t("submit")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

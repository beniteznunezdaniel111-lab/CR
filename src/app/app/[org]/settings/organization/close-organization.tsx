"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { idleState } from "@/lib/forms";
import { closeOrganizationAction } from "@/modules/privacy/actions";

/** Zona de peligro: cerrar la empresa escribiendo su nombre. */
export function CloseOrganization({ orgId, name }: { orgId: string; name: string }) {
  const t = useTranslations("privacy.close");
  const [state, formAction] = useActionState(closeOrganizationAction, idleState);
  const [typed, setTyped] = useState("");
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const id = useId();

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <TriangleAlertIcon className="size-5" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">{t("button")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("dialogTitle", { name })}</DialogTitle>
              <DialogDescription>{t("dialogDescription")}</DialogDescription>
            </DialogHeader>
            <form action={formAction} className="space-y-4" noValidate>
              <input type="hidden" name="orgId" value={orgId} />
              <div className="space-y-2">
                <Label htmlFor={id}>{t("confirmLabel")}</Label>
                <Input
                  id={id}
                  name="confirmName"
                  value={typed}
                  autoComplete="off"
                  onChange={(event) => setTyped(event.target.value)}
                  aria-invalid={Boolean(fieldErrors?.confirmName)}
                />
                <FieldError messages={fieldErrors?.confirmName} />
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
                <SubmitButton variant="destructive" disabled={typed.trim() !== name}>
                  {t("confirm")}
                </SubmitButton>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

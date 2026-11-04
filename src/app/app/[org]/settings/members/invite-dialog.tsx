"use client";

import { MailPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/forms";
import { type InvitationLinkResult, inviteMemberAction } from "@/modules/members/actions";
import { CopyLink } from "./copy-link";
import { RoleSelect } from "./role-select";

const initialState: FormState<InvitationLinkResult> = { status: "idle" };

function InviteForm({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const t = useTranslations("members");
  const [state, formAction] = useActionState(inviteMemberAction, initialState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;

  if (state.status === "success" && state.data) {
    return (
      <div className="space-y-4">
        <p className="text-sm">
          {state.data.emailSent ? t("invite.emailSent") : t("invite.emailNotSent")}
        </p>
        <CopyLink link={state.data.link} />
        <p className="text-xs text-muted-foreground">{t("invite.linkHelp")}</p>
        <DialogFooter>
          <Button type="button" onClick={onDone}>
            {t("invite.done")}
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="orgId" value={orgId} />
      <div className="space-y-2">
        <Label htmlFor="invite-email">{t("invite.email")}</Label>
        <Input id="invite-email" name="email" type="email" required autoComplete="off" />
        <FieldError messages={fieldErrors?.email} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-role">{t("invite.role")}</Label>
        <RoleSelect id="invite-role" name="role" defaultValue="employee" />
        <p className="text-xs text-muted-foreground">{t("invite.roleHelp")}</p>
        <FieldError messages={fieldErrors?.role} />
      </div>
      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <DialogFooter>
        <SubmitButton pendingLabel={t("invite.pending")}>{t("invite.submit")}</SubmitButton>
      </DialogFooter>
    </form>
  );
}

export function InviteDialog({ orgId }: { orgId: string }) {
  const t = useTranslations("members");
  const [open, setOpen] = useState(false);
  // Clave nueva en cada apertura: el formulario empieza siempre vacío.
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((key) => key + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <MailPlusIcon aria-hidden />
          {t("invite.open")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invite.title")}</DialogTitle>
          <DialogDescription>{t("invite.description")}</DialogDescription>
        </DialogHeader>
        <InviteForm key={formKey} orgId={orgId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

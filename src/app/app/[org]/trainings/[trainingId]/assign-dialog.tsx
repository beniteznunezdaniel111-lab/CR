"use client";

import { Loader2Icon, UserPlusIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { type FormState, idleState } from "@/lib/forms";
import { assignTrainingAction, removeAssignmentAction } from "@/modules/trainings/actions";

/** Asignar la formación (con aviso a cada persona y fecha límite opcional). */
export function AssignDialog({
  orgId,
  trainingId,
  members,
  today,
}: {
  orgId: string;
  trainingId: string;
  members: { userId: string; name: string }[];
  today: string;
}) {
  const t = useTranslations("trainings.assign");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [state, formAction] = useActionState(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      const result = await assignTrainingAction(previous, formData);
      if (result.status === "success") {
        toast.success(result.message ?? "");
        setOpen(false);
        setSelected([]);
        return idleState;
      }
      return result;
    },
    idleState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const dueId = useId();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="trainingId" value={trainingId} />
          {selected.map((id) => (
            <input key={id} type="hidden" name="userIds" value={id} />
          ))}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("people")}</legend>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noMembers")}</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${dueId}-all`}
                    checked={selected.length === members.length}
                    onCheckedChange={(checked) =>
                      setSelected(checked === true ? members.map((member) => member.userId) : [])
                    }
                  />
                  <Label htmlFor={`${dueId}-all`} className="font-normal">
                    {t("selectAll")}
                  </Label>
                </div>
                <ul className="max-h-60 space-y-1.5 overflow-y-auto rounded-md border p-2">
                  {members.map((member) => (
                    <li key={member.userId} className="flex items-center gap-2">
                      <Checkbox
                        id={`${dueId}-${member.userId}`}
                        checked={selected.includes(member.userId)}
                        onCheckedChange={(checked) =>
                          setSelected((current) =>
                            checked === true
                              ? [...current, member.userId]
                              : current.filter((value) => value !== member.userId),
                          )
                        }
                      />
                      <Label htmlFor={`${dueId}-${member.userId}`} className="font-normal">
                        {member.name}
                      </Label>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <FieldError messages={fieldErrors?.userIds} />
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor={dueId}>{t("dueDate")}</Label>
            <Input
              id={dueId}
              name="dueDate"
              type="date"
              min={today}
              aria-invalid={Boolean(fieldErrors?.dueDate)}
            />
            <FieldError messages={fieldErrors?.dueDate} />
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
            <SubmitButton disabled={selected.length === 0}>{t("submit")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RemoveAssignmentButton({
  orgId,
  trainingId,
  assignmentId,
  name,
}: {
  orgId: string;
  trainingId: string;
  assignmentId: string;
  name: string;
}) {
  const t = useTranslations("trainings.editor.assignments");
  const tTrainings = useTranslations("trainings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`${t("remove")}: ${name}`}
      onClick={() =>
        startTransition(async () => {
          const result = await removeAssignmentAction({ orgId, trainingId, assignmentId });
          if (result.status === "error")
            toast.error(result.message ?? tTrainings("errors.generic"));
          router.refresh();
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : <XIcon aria-hidden />}
    </Button>
  );
}

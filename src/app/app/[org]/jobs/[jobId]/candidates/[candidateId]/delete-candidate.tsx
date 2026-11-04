"use client";

import { Loader2Icon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteCandidateAction } from "@/modules/candidates/actions";

type Reason = "candidate_request" | "manual";

/** Borrado de la candidatura (p. ej. derecho de supresión de la persona candidata). */
export function DeleteCandidate({
  orgId,
  candidateId,
  backHref,
}: {
  orgId: string;
  candidateId: string;
  backHref: string;
}) {
  const t = useTranslations("candidates.delete");
  const router = useRouter();
  const [reason, setReason] = useState<Reason>("candidate_request");
  const [pending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      const result = await deleteCandidateAction({ orgId, candidateId, reason });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      if (result.status === "success" && result.message) toast.success(result.message);
      router.push(backHref);
      router.refresh();
    });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive">
          <Trash2Icon aria-hidden />
          {t("button")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-1 font-medium">{t("reason")}</legend>
          {(["candidate_request", "manual"] as const).map((value) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="delete-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="size-4 accent-primary"
              />
              {t(`reasons.${value}`)}
            </label>
          ))}
        </fieldset>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <Button variant="destructive" onClick={remove} disabled={pending} aria-busy={pending}>
            {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {t("confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

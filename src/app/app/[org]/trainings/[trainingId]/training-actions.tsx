"use client";

import { CopyIcon, Loader2Icon, SendIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  deleteTrainingAction,
  duplicateTrainingAction,
  publishTrainingAction,
} from "@/modules/trainings/actions";

/** Publicar, duplicar y borrar una formación. */
export function TrainingActions({
  orgId,
  orgSlug,
  trainingId,
  title,
  published,
  canDelete,
}: {
  orgId: string;
  orgSlug: string;
  trainingId: string;
  title: string;
  published: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("trainings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<void>) => startTransition(action);

  return (
    <>
      {!published ? (
        <Button
          disabled={pending}
          onClick={() =>
            run(async () => {
              const result = await publishTrainingAction({ orgId, trainingId });
              if (result.status === "success") toast.success(result.message ?? t("published"));
              else
                toast.error((result.status === "error" && result.message) || t("errors.generic"));
              router.refresh();
            })
          }
        >
          {pending ? (
            <Loader2Icon className="animate-spin" aria-hidden />
          ) : (
            <SendIcon aria-hidden />
          )}
          {t("editor.publish")}
        </Button>
      ) : null}
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const result = await duplicateTrainingAction({ orgId, trainingId });
            if (result.status === "success" && result.data) {
              toast.success(t("duplicated"));
              router.push(`/app/${orgSlug}/trainings/${result.data.id}`);
            } else {
              toast.error((result.status === "error" && result.message) || t("errors.generic"));
            }
          })
        }
      >
        <CopyIcon aria-hidden />
        {t("editor.duplicate")}
      </Button>
      {canDelete ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" disabled={pending}>
              <Trash2Icon aria-hidden />
              {t("editor.delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("editor.deleteConfirm.title", { title })}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("editor.deleteConfirm.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("editor.deleteConfirm.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  run(async () => {
                    const result = await deleteTrainingAction({ orgId, trainingId });
                    if (result.status === "success") {
                      toast.success(result.message ?? t("deleted"));
                      router.push(`/app/${orgSlug}/trainings`);
                    } else {
                      toast.error(
                        (result.status === "error" && result.message) || t("errors.generic"),
                      );
                    }
                  })
                }
              >
                {t("editor.deleteConfirm.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}

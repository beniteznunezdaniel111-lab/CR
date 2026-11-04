"use client";

import { DownloadIcon, Loader2Icon, RefreshCwIcon, Trash2Icon } from "lucide-react";
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
import { deleteKbDocumentAction, processKbDocumentAction } from "@/modules/faq/actions";

/** Descargar, reprocesar y borrar un documento de la FAQ. */
export function DocumentActions({
  orgId,
  documentId,
  title,
  downloadHref,
}: {
  orgId: string;
  documentId: string;
  title: string;
  downloadHref: string;
}) {
  const t = useTranslations("faq.documents");
  const router = useRouter();
  const [processing, startProcess] = useTransition();
  const [deleting, startDelete] = useTransition();

  const reprocess = () =>
    startProcess(async () => {
      const result = await processKbDocumentAction({ orgId, documentId });
      if (result.status === "success" && result.data?.ready) {
        toast.success(t("upload.done", { chunks: result.data.chunks }));
      } else {
        toast.error(
          result.status === "success" && result.data && !result.data.ready
            ? result.data.error
            : (result.status === "error" && result.message) || t("errors.generic"),
        );
      }
      router.refresh();
    });

  return (
    <div className="flex flex-wrap justify-end gap-1">
      <Button asChild variant="ghost" size="sm">
        <a href={downloadHref} aria-label={`${t("download")}: ${title}`}>
          <DownloadIcon aria-hidden />
          <span className="sr-only sm:not-sr-only">{t("download")}</span>
        </a>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={reprocess}
        disabled={processing || deleting}
        aria-label={`${t("reprocess")}: ${title}`}
      >
        {processing ? (
          <Loader2Icon className="animate-spin" aria-hidden />
        ) : (
          <RefreshCwIcon aria-hidden />
        )}
        <span className="sr-only sm:not-sr-only">
          {processing ? t("reprocessing") : t("reprocess")}
        </span>
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            disabled={processing || deleting}
            aria-label={`${t("delete")}: ${title}`}
          >
            <Trash2Icon aria-hidden />
            <span className="sr-only sm:not-sr-only">{t("delete")}</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm.title", { title })}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteConfirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                startDelete(async () => {
                  const result = await deleteKbDocumentAction({ orgId, documentId });
                  if (result.status === "success") toast.success(result.message ?? t("deleted"));
                  else
                    toast.error(
                      (result.status === "error" && result.message) || t("errors.delete"),
                    );
                  router.refresh();
                })
              }
            >
              {t("deleteConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

"use client";

import { Loader2Icon, SparklesIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { generateJobContentAction } from "@/modules/jobs/actions";

/** Genera (o regenera) con IA la descripción y las ofertas: crea una versión nueva. */
export function GenerateButton({
  orgId,
  jobId,
  hasContent,
  variant = "default",
}: {
  orgId: string;
  jobId: string;
  hasContent: boolean;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("jobs.generate");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const generate = () =>
    startTransition(async () => {
      const form = new FormData();
      form.set("orgId", orgId);
      form.set("jobId", jobId);
      const result = await generateJobContentAction(form);
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      toast.success(t("done"));
      router.replace(pathname);
      router.refresh();
    });

  return (
    <>
      <Button
        variant={variant}
        disabled={pending}
        aria-busy={pending}
        onClick={() => (hasContent ? setConfirming(true) : generate())}
      >
        {pending ? (
          <Loader2Icon className="animate-spin" aria-hidden />
        ) : (
          <SparklesIcon aria-hidden />
        )}
        {pending ? t("pending") : hasContent ? t("regenerate") : t("button")}
      </Button>
      {pending ? (
        <p role="status" className="text-xs text-muted-foreground">
          {t("pendingHelp")}
        </p>
      ) : null}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={generate}>{t("regenerate")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

"use client";

import { EyeOffIcon, Loader2Icon, LockIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setAnonymousReviewAction } from "@/modules/candidates/actions";

/** Activa o desactiva la revisión anónima del puesto (no se desactiva con candidaturas). */
export function AnonymousReview({
  orgId,
  jobId,
  enabled,
  hasCandidates,
}: {
  orgId: string;
  jobId: string;
  enabled: boolean;
  hasCandidates: boolean;
}) {
  const t = useTranslations("candidates.anonymous");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (next: boolean) =>
    startTransition(async () => {
      const result = await setAnonymousReviewAction({ orgId, jobId, enabled: next });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      if (result.status === "success" && result.message) toast.success(result.message);
      router.refresh();
    });

  return (
    <section aria-labelledby="anonymous-title" className="space-y-3">
      <div className="flex items-center gap-2">
        <EyeOffIcon className="size-4 text-primary" aria-hidden />
        <h2 id="anonymous-title" className="font-medium">
          {t("title")}
        </h2>
        {enabled ? <Badge variant="secondary">{t("badge")}</Badge> : null}
      </div>
      <p className="text-sm text-muted-foreground">{enabled ? t("on") : t("off")}</p>
      {enabled && hasCandidates ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LockIcon className="size-3.5" aria-hidden />
          {t("locked")}
        </p>
      ) : (
        <Button
          variant={enabled ? "outline" : "default"}
          size="sm"
          disabled={pending}
          onClick={() => change(!enabled)}
        >
          {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
          {enabled ? t("disable") : t("enable")}
        </Button>
      )}
    </section>
  );
}

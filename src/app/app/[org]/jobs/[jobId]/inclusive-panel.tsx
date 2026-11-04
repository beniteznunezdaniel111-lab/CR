"use client";

import { CheckCircle2Icon, Loader2Icon, ScanSearchIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Severity } from "@/lib/inclusive/types";
import { cn } from "@/lib/utils";
import type { JobDoc } from "@/modules/jobs/constants";
import type { InclusiveReview } from "@/modules/jobs/inclusive-review";

const SEVERITY_STYLES: Record<Severity, string> = {
  high: "border-red-200 bg-red-50 text-red-800",
  medium: "border-amber-200 bg-amber-50 text-amber-900",
  low: "border-slate-200 bg-slate-50 text-slate-700",
};

export function InclusivePanel({
  review,
  stale,
  canReviewWithAi,
  reviewing,
  onReviewWithAi,
  onSelectDoc,
}: {
  review: InclusiveReview | null;
  /** Hay cambios sin guardar: la revisión mostrada es de la versión guardada. */
  stale: boolean;
  canReviewWithAi: boolean;
  reviewing: boolean;
  onReviewWithAi: () => void;
  onSelectDoc: (doc: JobDoc) => void;
}) {
  const t = useTranslations("jobs.inclusive");

  return (
    <section aria-labelledby="inclusive-title" className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="inclusive-title" className="flex items-center gap-2 font-medium">
            <ScanSearchIcon className="size-4 text-primary" aria-hidden />
            {t("title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {!review
              ? t("notReviewed")
              : review.aiReviewed
                ? t("reviewedRulesAndAi")
                : t("reviewedRules")}
          </p>
        </div>
      </div>

      {stale ? <p className="text-xs text-amber-700">{t("stale")}</p> : null}

      {canReviewWithAi ? (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={onReviewWithAi}
          disabled={reviewing}
          aria-busy={reviewing}
        >
          {reviewing ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
          {review?.aiReviewed ? t("reviewAgainWithAi") : t("reviewWithAi")}
        </Button>
      ) : null}

      {review?.notices.map((notice) => (
        <p
          key={notice.code}
          className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
        >
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t(`notices.${notice.code}`)}
        </p>
      ))}

      {review && review.findings.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle2Icon className="size-4" aria-hidden />
          {t("noFindings")}
        </p>
      ) : null}

      {review && review.findings.length > 0 ? (
        <ul
          className="space-y-2"
          aria-label={t("findingsLabel", { count: review.findings.length })}
        >
          {review.findings.map((finding) => (
            <li
              key={finding.key}
              className={cn(
                "space-y-1 rounded-md border p-3 text-xs",
                SEVERITY_STYLES[finding.severity],
              )}
              data-testid="inclusive-finding"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="bg-background/60">
                  {t(`severities.${finding.severity}`)}
                </Badge>
                <span className="font-medium">{t(`categories.${finding.category}`)}</span>
                <span className="ml-auto text-muted-foreground">
                  {finding.source === "ai" ? t("sourceAi") : t("sourceRules")}
                </span>
              </div>
              <p>
                <q className="font-semibold">{finding.excerpt}</q>{" "}
                {isDoc(finding.field) ? (
                  <button
                    type="button"
                    className="underline underline-offset-2"
                    onClick={() => onSelectDoc(finding.field as JobDoc)}
                  >
                    {t("inDoc", { doc: t(`docs.${finding.field}`) })}
                  </button>
                ) : null}
              </p>
              <p>{finding.explanation}</p>
              <p>
                <span className="font-medium">{t("suggestion")}:</span> {finding.suggestion}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {review && review.aiDiscarded > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("aiDiscarded", { count: review.aiDiscarded })}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">{t("disclaimer")}</p>
    </section>
  );
}

function isDoc(field: string): field is JobDoc {
  return ["internal", "linkedin", "jobBoard", "website"].includes(field);
}

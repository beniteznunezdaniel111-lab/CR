import { CheckCircle2Icon, CircleDashedIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  CandidateStatus,
  MatchResult,
  ProcessingStatus,
} from "@/modules/candidates/constants";

const STATUS_STYLES: Record<CandidateStatus, string> = {
  pending: "border-slate-300 bg-slate-50 text-slate-700",
  reviewed: "border-sky-300 bg-sky-50 text-sky-800",
  advance: "border-emerald-300 bg-emerald-50 text-emerald-800",
  no_advance: "border-zinc-300 bg-zinc-100 text-zinc-700",
};

/** Decisión humana sobre la candidatura. */
export function CandidateStatusBadge({ status }: { status: CandidateStatus }) {
  const t = useTranslations("candidates.statuses");
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {t(status)}
    </Badge>
  );
}

/** Estado del procesado (extracción y análisis con IA). */
export function ProcessingBadge({ status }: { status: ProcessingStatus }) {
  const t = useTranslations("candidates.processing");
  const icon = {
    pending: <CircleDashedIcon aria-hidden />,
    processing: <Loader2Icon className="animate-spin" aria-hidden />,
    done: <CheckCircle2Icon aria-hidden />,
    failed: <TriangleAlertIcon aria-hidden />,
  }[status];
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "failed" && "border-red-300 bg-red-50 text-red-800",
        status === "done" && "text-muted-foreground",
      )}
    >
      {icon}
      {t(status)}
    </Badge>
  );
}

const RESULT_STYLES: Record<MatchResult, string> = {
  meets: "border-emerald-300 bg-emerald-50 text-emerald-800",
  partial: "border-amber-300 bg-amber-50 text-amber-900",
  not_found: "border-slate-300 bg-slate-50 text-slate-700",
};

/** Resultado sugerido por la IA para un requisito. */
export function MatchResultBadge({ result }: { result: MatchResult }) {
  const t = useTranslations("candidates.results");
  return (
    <Badge variant="outline" className={RESULT_STYLES[result]}>
      {t(result)}
    </Badge>
  );
}

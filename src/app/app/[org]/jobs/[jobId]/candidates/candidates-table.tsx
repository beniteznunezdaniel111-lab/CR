"use client";

import { Loader2Icon, RotateCwIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CandidateStatusBadge, ProcessingBadge } from "@/components/candidates/candidate-badges";
import { ControlledSelect } from "@/components/forms/controlled-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { processCandidateAction } from "@/modules/candidates/actions";
import type { AnalysisCounts } from "@/modules/candidates/analysis";
import {
  CANDIDATE_STATUSES,
  type CandidateStatus,
  type ProcessingStatus,
} from "@/modules/candidates/constants";

export type PipelineRow = {
  id: string;
  title: string;
  subtitle: string | null;
  status: CandidateStatus;
  processingStatus: ProcessingStatus;
  processingMessage: string | null;
  /** Sin analizar, con error o con un análisis interrumpido. */
  canProcess: boolean;
  counts: AnalysisCounts | null;
  uploaded: string;
  href: string;
};

type Sort = "number" | "required";

export function ProcessButton({
  orgId,
  candidateId,
  label,
  size = "sm",
  variant = "outline",
}: {
  orgId: string;
  candidateId: string;
  label: string;
  size?: "sm" | "default";
  variant?: "outline" | "default";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size={size}
      variant={variant}
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await processCandidateAction({ orgId, candidateId });
          if (result.status === "error") toast.error(result.message);
          else if (result.status === "success" && result.data?.processing === "failed") {
            toast.error(result.data.message);
          }
          router.refresh();
        })
      }
    >
      {pending ? (
        <Loader2Icon className="animate-spin" aria-hidden />
      ) : (
        <RotateCwIcon aria-hidden />
      )}
      {label}
    </Button>
  );
}

export function CandidatesTable({ orgId, rows }: { orgId: string; rows: PipelineRow[] }) {
  const t = useTranslations("candidates.pipeline");
  const tStatus = useTranslations("candidates.statuses");
  const allRequiredId = useId();
  const errorsId = useId();
  const [status, setStatus] = useState<CandidateStatus | "">("");
  const [sort, setSort] = useState<Sort>("number");
  const [onlyAllRequired, setOnlyAllRequired] = useState(false);
  const [onlyErrors, setOnlyErrors] = useState(false);

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (row) =>
        (!status || row.status === status) &&
        (!onlyAllRequired ||
          (row.counts !== null &&
            row.counts.requiredTotal > 0 &&
            row.counts.requiredMet === row.counts.requiredTotal)) &&
        (!onlyErrors || row.processingStatus === "failed"),
    );
    if (sort === "number") return filtered;
    return [...filtered].sort(
      (a, b) =>
        (b.counts?.requiredMet ?? -1) - (a.counts?.requiredMet ?? -1) ||
        (b.counts?.preferredMet ?? -1) - (a.counts?.preferredMet ?? -1),
    );
  }, [rows, status, sort, onlyAllRequired, onlyErrors]);

  const count = (counts: AnalysisCounts | null, kind: "required" | "preferred") => {
    if (!counts) return "—";
    const met = kind === "required" ? counts.requiredMet : counts.preferredMet;
    const total = kind === "required" ? counts.requiredTotal : counts.preferredTotal;
    return total === 0 ? "—" : t("count", { met, total });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-52">
          <ControlledSelect
            name="statusFilter"
            ariaLabel={t("filters.status")}
            value={status}
            onChange={setStatus}
            allowEmpty
            emptyLabel={t("filters.all")}
            options={CANDIDATE_STATUSES.map((value) => ({ value, label: tStatus(value) }))}
          />
        </div>
        <div className="w-56">
          <ControlledSelect
            name="sort"
            ariaLabel={t("filters.sort")}
            value={sort}
            onChange={(value) => setSort((value || "number") as Sort)}
            options={[
              { value: "number", label: t("filters.sortNumber") },
              { value: "required", label: t("filters.sortRequired") },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={allRequiredId}
            checked={onlyAllRequired}
            onCheckedChange={(value) => setOnlyAllRequired(value === true)}
          />
          <Label htmlFor={allRequiredId} className="font-normal">
            {t("filters.onlyAllRequired")}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={errorsId}
            checked={onlyErrors}
            onCheckedChange={(value) => setOnlyErrors(value === true)}
          />
          <Label htmlFor={errorsId} className="font-normal">
            {t("filters.onlyErrors")}
          </Label>
        </div>
      </div>

      <Table>
        <TableCaption className="text-left">
          {t("shown", { shown: visible.length, total: rows.length })} · {t("countHelp")}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.candidate")}</TableHead>
            <TableHead>{t("columns.required")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("columns.preferred")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
            <TableHead>{t("columns.analysis")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("columns.uploaded")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("review")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                {t("noMatches")}
              </TableCell>
            </TableRow>
          ) : (
            visible.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-64">
                  <Link href={row.href} className="font-medium hover:underline">
                    {row.title}
                  </Link>
                  {row.subtitle ? (
                    <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
                  ) : null}
                </TableCell>
                <TableCell className="tabular-nums">{count(row.counts, "required")}</TableCell>
                <TableCell className="hidden tabular-nums sm:table-cell">
                  {count(row.counts, "preferred")}
                </TableCell>
                <TableCell>
                  <CandidateStatusBadge status={row.status} />
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <ProcessingBadge status={row.processingStatus} />
                    {row.processingMessage ? (
                      <p className="max-w-56 text-xs text-destructive">{row.processingMessage}</p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {row.uploaded}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {row.canProcess ? (
                      <ProcessButton
                        orgId={orgId}
                        candidateId={row.id}
                        label={row.processingStatus === "pending" ? t("analyze") : t("retry")}
                      />
                    ) : null}
                    <Button asChild size="sm" variant="ghost">
                      <Link href={row.href}>{t("review")}</Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

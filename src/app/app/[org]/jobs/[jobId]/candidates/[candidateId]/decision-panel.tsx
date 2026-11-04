"use client";

import { Loader2Icon, UserCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { CandidateStatusBadge } from "@/components/candidates/candidate-badges";
import { ControlledSelect } from "@/components/forms/controlled-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setCandidateStatusAction } from "@/modules/candidates/actions";
import {
  CANDIDATE_STATUSES,
  type CandidateStatus,
  DECISION_COMMENT_MAX,
} from "@/modules/candidates/constants";

/** Decisión humana: la única forma de cambiar el estado de una candidatura. */
export function DecisionPanel({
  orgId,
  candidateId,
  status,
  decidedBy,
}: {
  orgId: string;
  candidateId: string;
  status: CandidateStatus;
  /** "Por X el fecha", ya formateado; null si nadie ha decidido. */
  decidedBy: string | null;
}) {
  const t = useTranslations("candidates.decision");
  const tStatus = useTranslations("candidates.statuses");
  const router = useRouter();
  const statusId = useId();
  const commentId = useId();
  const [next, setNext] = useState<CandidateStatus | "">("");
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      if (!next) return;
      const result = await setCandidateStatusAction({
        orgId,
        candidateId,
        status: next,
        comment,
      });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      if (result.status === "success" && result.message) toast.success(result.message);
      setNext("");
      setComment("");
      router.refresh();
    });

  return (
    <section aria-labelledby="decision-title" className="space-y-4">
      <div className="flex items-center gap-2">
        <UserCheckIcon className="size-4 text-primary" aria-hidden />
        <h2 id="decision-title" className="font-medium">
          {t("title")}
        </h2>
      </div>
      <div className="space-y-1 text-sm">
        <p className="text-xs text-muted-foreground">{t("current")}</p>
        <CandidateStatusBadge status={status} />
        <p className="text-xs text-muted-foreground">{decidedBy ?? t("never")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={statusId}>{t("newStatus")}</Label>
        <ControlledSelect
          id={statusId}
          name="status"
          value={next}
          onChange={setNext}
          options={CANDIDATE_STATUSES.filter((value) => value !== status).map((value) => ({
            value,
            label: tStatus(value),
          }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={commentId}>{t("comment")}</Label>
        <Textarea
          id={commentId}
          rows={3}
          maxLength={DECISION_COMMENT_MAX}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("commentHelp")}</p>
      </div>
      <Button onClick={save} disabled={!next || pending} aria-busy={pending} className="w-full">
        {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
        {t("save")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("humanOnly")}</p>
    </section>
  );
}

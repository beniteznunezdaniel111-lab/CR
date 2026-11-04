"use client";

import { Loader2Icon, SparklesIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ControlledSelect } from "@/components/forms/controlled-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { generateInterviewGuideAction } from "@/modules/interviews/actions";

export type CandidateOption = { id: string; label: string; analyzed: boolean };

/** Genera una guía nueva para el puesto o adaptada a una candidatura analizada. */
export function GenerateGuide({
  orgId,
  jobId,
  candidates,
  initialCandidate,
}: {
  orgId: string;
  jobId: string;
  candidates: CandidateOption[];
  initialCandidate: string | null;
}) {
  const t = useTranslations("interviews.generate");
  const router = useRouter();
  const pathname = usePathname();
  const candidateId = useId();
  const [target, setTarget] = useState<"job" | "candidate">(initialCandidate ? "candidate" : "job");
  const [candidate, setCandidate] = useState(initialCandidate ?? "");
  const [pending, startTransition] = useTransition();
  const analyzed = candidates.filter((option) => option.analyzed);

  const generate = () =>
    startTransition(async () => {
      const result = await generateInterviewGuideAction({
        orgId,
        jobId,
        candidateId: target === "candidate" && candidate ? candidate : undefined,
      });
      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      if (result.status === "success" && result.message) toast.success(result.message);
      if (result.status === "success" && result.data) {
        router.push(`${pathname}?guide=${result.data.guideId}`);
      }
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 font-medium">{t("target")}</legend>
        {(["job", "candidate"] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="guide-target"
              value={value}
              checked={target === value}
              disabled={value === "candidate" && analyzed.length === 0}
              onChange={() => setTarget(value)}
              className="size-4 accent-primary"
            />
            {value === "job" ? t("forJob") : t("forCandidate")}
          </label>
        ))}
      </fieldset>
      {analyzed.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("noCandidates")}</p>
      ) : null}
      {target === "candidate" ? (
        <div className="space-y-2">
          <Label htmlFor={candidateId}>{t("candidate")}</Label>
          <ControlledSelect
            id={candidateId}
            name="candidate"
            value={candidate}
            onChange={setCandidate}
            placeholder={t("choose")}
            options={analyzed.map((option) => ({ value: option.id, label: option.label }))}
          />
        </div>
      ) : null}
      <Button
        onClick={generate}
        disabled={pending || (target === "candidate" && !candidate)}
        aria-busy={pending}
      >
        {pending ? (
          <Loader2Icon className="animate-spin" aria-hidden />
        ) : (
          <SparklesIcon aria-hidden />
        )}
        {pending ? t("pending") : t("button")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("help")}</p>
    </div>
  );
}

/** Selector del historial de guías del puesto. */
export function GuidePicker({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string }[];
}) {
  const t = useTranslations("interviews");
  const router = useRouter();
  const pathname = usePathname();
  return (
    <div className="w-full max-w-md">
      <ControlledSelect
        name="guide"
        ariaLabel={t("version")}
        value={value}
        onChange={(next) => next && router.push(`${pathname}?guide=${next}`)}
        options={options}
      />
    </div>
  );
}

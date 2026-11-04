"use client";

import { PencilIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ControlledSelect } from "@/components/forms/controlled-select";
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
import { JOB_STATUSES, type JobStatus } from "@/modules/jobs/constants";
import { deleteJobAction, setJobStatusAction } from "@/modules/jobs/actions";

export function JobActions({
  orgId,
  jobId,
  status,
  editHref,
}: {
  orgId: string;
  jobId: string;
  status: JobStatus;
  editHref: string;
}) {
  const t = useTranslations("jobs");
  const [current, setCurrent] = useState<JobStatus>(status);
  const [pending, startTransition] = useTransition();

  const data = (extra: Record<string, string> = {}) => {
    const form = new FormData();
    form.set("orgId", orgId);
    form.set("jobId", jobId);
    for (const [key, value] of Object.entries(extra)) form.set(key, value);
    return form;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-36">
        <ControlledSelect
          name="status"
          ariaLabel={t("statusLabel")}
          value={current}
          onChange={(next) => {
            if (!next || next === current) return;
            const previous = current;
            setCurrent(next);
            startTransition(async () => {
              const result = await setJobStatusAction(data({ status: next }));
              if (result.status === "error") {
                setCurrent(previous);
                toast.error(result.message);
              } else if (result.status === "success" && result.message) {
                toast.success(result.message);
              }
            });
          }}
          options={JOB_STATUSES.map((value) => ({ value, label: t(`statuses.${value}`) }))}
        />
      </div>
      <Button asChild variant="outline">
        <Link href={editHref}>
          <PencilIcon aria-hidden />
          {t("editJob")}
        </Link>
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("delete.button")} disabled={pending}>
            <Trash2Icon aria-hidden />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("delete.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteJobAction(data());
                  if (result?.status === "error") toast.error(result.message);
                })
              }
            >
              {t("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

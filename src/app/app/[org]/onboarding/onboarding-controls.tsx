"use client";

import { Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ControlledSelect } from "@/components/forms/controlled-select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/forms";
import {
  generateOnboardingPlanAction,
  setOnboardingTaskDoneAction,
} from "@/modules/onboarding/actions";

/** Genera un plan nuevo con IA a partir de un puesto y abre el editor. */
export function NewPlan({
  orgId,
  orgSlug,
  jobs,
  initialJob,
}: {
  orgId: string;
  orgSlug: string;
  jobs: { id: string; title: string }[];
  initialJob: string | null;
}) {
  const t = useTranslations("onboarding.newPlan");
  const router = useRouter();
  const jobId = useId();
  const [job, setJob] = useState(initialJob ?? "");
  const [pending, startTransition] = useTransition();

  const generate = () =>
    startTransition(async () => {
      const result = await generateOnboardingPlanAction({ orgId, jobId: job });
      if (result.status === "success" && result.data) {
        router.push(`/app/${orgSlug}/onboarding/plans/${result.data.planId}`);
        return;
      }
      toast.error(result.status === "error" ? result.message : undefined);
    });

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor={jobId}>{t("job")}</Label>
        <ControlledSelect
          id={jobId}
          name="job"
          value={job}
          onChange={setJob}
          placeholder={t("choose")}
          options={jobs.map((item) => ({ value: item.id, label: item.title }))}
        />
      </div>
      <Button onClick={generate} disabled={!job || pending} aria-busy={pending}>
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

/** Casilla para marcar una tarea asignada como hecha (con respuesta inmediata). */
export function TaskDone({
  orgId,
  taskId,
  title,
  done,
}: {
  orgId: string;
  taskId: string;
  title: string;
  done: boolean;
}) {
  const t = useTranslations("onboarding.assignment");
  const router = useRouter();
  const [checked, setChecked] = useState(done);
  const [pending, startTransition] = useTransition();
  return (
    <Checkbox
      checked={checked}
      disabled={pending}
      aria-label={t("markDone", { title })}
      onCheckedChange={(value) => {
        const next = value === true;
        setChecked(next);
        startTransition(async () => {
          const result = await setOnboardingTaskDoneAction({ orgId, taskId, done: next });
          if (result.status === "error") {
            setChecked(!next);
            toast.error(result.message);
          }
          router.refresh();
        });
      }}
    />
  );
}

/** Botón con confirmación para acciones de borrado que redirigen al terminar. */
export function ConfirmDelete({
  label,
  title,
  description,
  confirm,
  cancel,
  action,
}: {
  label: string;
  title: string;
  description: string;
  confirm: string;
  cancel: string;
  action: () => Promise<FormState>;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          <Trash2Icon aria-hidden />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancel}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await action();
                if (result?.status === "error") toast.error(result.message);
              })
            }
          >
            {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

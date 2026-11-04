"use client";

import { PlusIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState } from "react";
import { ControlledSelect } from "@/components/forms/controlled-select";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { idleState, valuesFrom } from "@/lib/forms";
import { assignOnboardingPlanAction, saveOnboardingPlanAction } from "@/modules/onboarding/actions";
import {
  MAX_PLAN_TASKS,
  ONBOARDING_PHASES,
  type OnboardingPhase,
  PHASE_RANGES,
} from "@/modules/onboarding/plan";

export type EditorTask = {
  phase: OnboardingPhase;
  due_day: number;
  title: string;
  owner_label: string;
  materials: string;
  description: string;
  is_checkpoint: boolean;
};

type Row = Omit<EditorTask, "due_day"> & { key: number; due_day: string };

/** Editor del plan: título, introducción y tareas (se guardan juntas). */
export function PlanEditor({
  orgId,
  planId,
  title: initialTitle,
  intro: initialIntro,
  tasks,
}: {
  orgId: string;
  planId: string;
  title: string;
  intro: string;
  tasks: EditorTask[];
}) {
  const t = useTranslations("onboarding.plan");
  const tPhase = useTranslations("onboarding.phases");
  const [state, formAction] = useActionState(saveOnboardingPlanAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const titleId = useId();
  const introId = useId();
  const [title, setTitle] = useState(initialTitle);
  const [intro, setIntro] = useState(initialIntro);
  const [rows, setRows] = useState<Row[]>(() =>
    tasks.map((task, index) => ({ ...task, due_day: String(task.due_day), key: index })),
  );
  const [nextKey, setNextKey] = useState(tasks.length);

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const serialized = JSON.stringify(
    rows.map(({ key: _key, ...row }) => ({ ...row, due_day: Number(row.due_day) || 0 })),
  );

  return (
    <form action={formAction} className="space-y-6" noValidate>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="tasks" value={serialized} />

      <div className="space-y-2">
        <Label htmlFor={titleId}>{t("fields.title")}</Label>
        <Input
          id={titleId}
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={Boolean(fieldErrors?.title)}
        />
        <FieldError messages={fieldErrors?.title} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={introId}>{t("fields.intro")}</Label>
        <Textarea
          id={introId}
          name="intro"
          rows={3}
          value={intro}
          onChange={(event) => setIntro(event.target.value)}
        />
      </div>

      <section className="space-y-3" aria-labelledby="tasks-title">
        <h2 id="tasks-title" className="font-medium">
          {t("tasksTitle")}
        </h2>
        {rows.map((row, index) => {
          const error = (field: string) => fieldErrors?.[`tasks.${index}.${field}`];
          const [min, max] = PHASE_RANGES[row.phase];
          return (
            <fieldset key={row.key} className="space-y-3 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">
                {t("task.heading", { index: index + 1 })}
              </legend>
              <div className="grid gap-3 sm:grid-cols-[10rem_6rem_1fr]">
                <div className="space-y-1">
                  <Label htmlFor={`phase-${row.key}`}>{t("task.phase")}</Label>
                  <ControlledSelect
                    id={`phase-${row.key}`}
                    name={`phase-${row.key}`}
                    value={row.phase}
                    onChange={(phase) => phase && update(row.key, { phase })}
                    options={ONBOARDING_PHASES.map((value) => ({ value, label: tPhase(value) }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`day-${row.key}`}>{t("task.day")}</Label>
                  <Input
                    id={`day-${row.key}`}
                    type="number"
                    min={min}
                    max={max}
                    value={row.due_day}
                    aria-invalid={Boolean(error("due_day"))}
                    onChange={(event) => update(row.key, { due_day: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`title-${row.key}`}>{t("task.title")}</Label>
                  <Input
                    id={`title-${row.key}`}
                    value={row.title}
                    aria-invalid={Boolean(error("title"))}
                    onChange={(event) => update(row.key, { title: event.target.value })}
                  />
                </div>
              </div>
              <FieldError messages={[...(error("due_day") ?? []), ...(error("title") ?? [])]} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`owner-${row.key}`}>{t("task.owner")}</Label>
                  <Input
                    id={`owner-${row.key}`}
                    value={row.owner_label}
                    onChange={(event) => update(row.key, { owner_label: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`materials-${row.key}`}>{t("task.materials")}</Label>
                  <Input
                    id={`materials-${row.key}`}
                    value={row.materials}
                    onChange={(event) => update(row.key, { materials: event.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`description-${row.key}`}>{t("task.description")}</Label>
                <Textarea
                  id={`description-${row.key}`}
                  rows={2}
                  value={row.description}
                  onChange={(event) => update(row.key, { description: event.target.value })}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`checkpoint-${row.key}`}
                    checked={row.is_checkpoint}
                    onCheckedChange={(value) => update(row.key, { is_checkpoint: value === true })}
                  />
                  <Label htmlFor={`checkpoint-${row.key}`} className="font-normal">
                    {t("task.checkpoint")}
                  </Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={rows.length <= 1}
                  onClick={() =>
                    setRows((current) => current.filter((item) => item.key !== row.key))
                  }
                >
                  <XIcon aria-hidden />
                  {t("task.remove", { index: index + 1 })}
                </Button>
              </div>
            </fieldset>
          );
        })}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length >= MAX_PLAN_TASKS}
          onClick={() => {
            setRows((current) => [
              ...current,
              {
                key: nextKey,
                phase: "d90",
                due_day: "90",
                title: "",
                owner_label: "",
                materials: "",
                description: "",
                is_checkpoint: false,
              },
            ]);
            setNextKey((key) => key + 1);
          }}
        >
          <PlusIcon aria-hidden />
          {t("task.add")}
        </Button>
        <FieldError messages={fieldErrors?.tasks} />
      </section>

      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <SubmitButton pendingLabel={t("saving")}>{t("save")}</SubmitButton>
    </form>
  );
}

/** Diálogo para asignar el plan a una persona que se incorpora. */
export function AssignPlan({
  orgId,
  planId,
  members,
  defaultStart,
}: {
  orgId: string;
  planId: string;
  members: { userId: string; name: string }[];
  defaultStart: string;
}) {
  const t = useTranslations("onboarding.plan.assign");
  const [state, formAction] = useActionState(assignOnboardingPlanAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const submitted = valuesFrom(state);
  const [member, setMember] = useState(submitted.memberUserId ?? "");
  const ids = { name: useId(), email: useId(), member: useId(), start: useId() };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4" noValidate>
          <input type="hidden" name="orgId" value={orgId} />
          <input type="hidden" name="planId" value={planId} />
          <div className="space-y-2">
            <Label htmlFor={ids.name}>{t("name")}</Label>
            <Input
              id={ids.name}
              name="employeeName"
              defaultValue={submitted.employeeName}
              aria-invalid={Boolean(fieldErrors?.employeeName)}
            />
            <FieldError messages={fieldErrors?.employeeName} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.email}>{t("email")}</Label>
            <Input
              id={ids.email}
              name="employeeEmail"
              type="email"
              defaultValue={submitted.employeeEmail}
              aria-invalid={Boolean(fieldErrors?.employeeEmail)}
            />
            <FieldError messages={fieldErrors?.employeeEmail} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.member}>{t("member")}</Label>
            <ControlledSelect
              id={ids.member}
              name="memberUserId"
              value={member}
              onChange={setMember}
              allowEmpty
              emptyLabel={t("noMember")}
              options={members.map((item) => ({ value: item.userId, label: item.name }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={ids.start}>{t("start")}</Label>
            <Input
              id={ids.start}
              name="startDate"
              type="date"
              defaultValue={submitted.startDate ?? defaultStart}
              aria-invalid={Boolean(fieldErrors?.startDate)}
            />
            <FieldError messages={fieldErrors?.startDate} />
          </div>
          <FormMessage
            status={state.status}
            message={"message" in state ? state.message : undefined}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t("cancel")}
              </Button>
            </DialogClose>
            <SubmitButton>{t("submit")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

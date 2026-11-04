"use client";

import { PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";
import { ControlledSelect } from "@/components/forms/controlled-select";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CountryCode, CurrencyCode } from "@/lib/countries/types";
import { idleState, valuesFrom } from "@/lib/forms";
import { checkInclusiveRules } from "@/lib/inclusive/rules";
import { saveJobAction } from "@/modules/jobs/actions";
import {
  JOB_LEVELS,
  JOB_TONES,
  type JobLevel,
  type JobTone,
  MAX_REQUIREMENTS,
  REQUIREMENT_KINDS,
  type RequirementKind,
  SALARY_PERIODS,
  type SalaryPeriod,
  WORK_MODES,
  type WorkMode,
} from "@/modules/jobs/constants";

export type JobFormInitial = {
  jobId?: string;
  title: string;
  department: string;
  level: JobLevel | "";
  workMode: WorkMode | "";
  location: string;
  responsibilities: string;
  requirements: { id?: string; text: string; kind: RequirementKind }[];
  salaryMin: string;
  salaryMax: string;
  salaryCurrency: CurrencyCode | "";
  salaryPeriod: SalaryPeriod | "";
  benefits: string;
  tone: JobTone;
};

type RequirementRow = { key: number; id?: string; text: string; kind: RequirementKind };

export function JobForm({
  orgId,
  country,
  currencies,
  payTransparency,
  initial,
}: {
  orgId: string;
  country: CountryCode;
  currencies: readonly CurrencyCode[];
  payTransparency: boolean;
  initial: JobFormInitial;
}) {
  const t = useTranslations("jobs");
  const tForm = useTranslations("jobs.form");
  const [state, formAction] = useActionState(saveJobAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const submitted = valuesFrom(state);

  const [level, setLevel] = useState<JobLevel | "">(initial.level);
  const [workMode, setWorkMode] = useState<WorkMode | "">(initial.workMode);
  const [tone, setTone] = useState<JobTone>(initial.tone);
  const [currency, setCurrency] = useState<CurrencyCode | "">(
    initial.salaryCurrency || currencies[0] || "",
  );
  const [period, setPeriod] = useState<SalaryPeriod | "">(initial.salaryPeriod || "year");
  const [responsibilities, setResponsibilities] = useState(initial.responsibilities);
  const [benefits, setBenefits] = useState(initial.benefits);
  const [rows, setRows] = useState<RequirementRow[]>(() =>
    (initial.requirements.length
      ? initial.requirements
      : [{ text: "", kind: "required" as const }]
    ).map((req, index) => ({ ...req, key: index })),
  );
  const [nextKey, setNextKey] = useState(rows.length);

  const requirementsJson = JSON.stringify(
    rows
      .filter((row) => row.text.trim())
      .map((row) => ({ id: row.id, text: row.text.trim(), kind: row.kind })),
  );

  // Revisión instantánea de los datos introducidos (mismas reglas que las ofertas).
  const warnings = useMemo(
    () =>
      checkInclusiveRules(
        [
          { field: "responsibilities", text: responsibilities },
          { field: "requirements", text: rows.map((row) => row.text).join("\n") },
          { field: "benefits", text: benefits },
        ],
        country,
      ),
    [responsibilities, rows, benefits, country],
  );

  const option = <T extends string>(values: readonly T[], prefix: string) =>
    values.map((value) => ({ value, label: t(`${prefix}.${value}` as string) }));

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <input type="hidden" name="orgId" value={orgId} />
      {initial.jobId ? <input type="hidden" name="jobId" value={initial.jobId} /> : null}
      <input type="hidden" name="requirements" value={requirementsJson} />

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">{tForm("title")}</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={submitted.title ?? initial.title}
            placeholder={tForm("titlePlaceholder")}
            aria-invalid={Boolean(fieldErrors?.title)}
          />
          <FieldError messages={fieldErrors?.title} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="department">
            {tForm("department")} <Optional />
          </Label>
          <Input
            id="department"
            name="department"
            defaultValue={submitted.department ?? initial.department}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="level">{tForm("level")}</Label>
          <ControlledSelect
            id="level"
            name="level"
            value={level}
            onChange={setLevel}
            options={option(JOB_LEVELS, "levels")}
            placeholder={tForm("choose")}
            invalid={Boolean(fieldErrors?.level)}
          />
          <FieldError messages={fieldErrors?.level} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="workMode">{tForm("workMode")}</Label>
          <ControlledSelect
            id="workMode"
            name="workMode"
            value={workMode}
            onChange={setWorkMode}
            options={option(WORK_MODES, "workModes")}
            placeholder={tForm("choose")}
            invalid={Boolean(fieldErrors?.workMode)}
          />
          <FieldError messages={fieldErrors?.workMode} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">
            {tForm("location")} <Optional />
          </Label>
          <Input
            id="location"
            name="location"
            defaultValue={submitted.location ?? initial.location}
          />
        </div>
      </section>

      <section className="space-y-2">
        <Label htmlFor="responsibilities">{tForm("responsibilities")}</Label>
        <Textarea
          id="responsibilities"
          name="responsibilities"
          rows={6}
          value={responsibilities}
          onChange={(event) => setResponsibilities(event.target.value)}
          placeholder={tForm("responsibilitiesPlaceholder")}
          aria-invalid={Boolean(fieldErrors?.responsibilities)}
        />
        <p className="text-xs text-muted-foreground">{tForm("responsibilitiesHelp")}</p>
        <FieldError messages={fieldErrors?.responsibilities} />
      </section>

      <section className="space-y-3" aria-labelledby="requirements-title">
        <div>
          <h2 id="requirements-title" className="text-sm font-medium">
            {tForm("requirements")}
          </h2>
          <p className="text-xs text-muted-foreground">{tForm("requirementsHelp")}</p>
        </div>
        <ul className="space-y-2">
          {rows.map((row, index) => (
            <li key={row.key} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                aria-label={tForm("requirementLabel", { index: index + 1 })}
                value={row.text}
                placeholder={tForm("requirementPlaceholder")}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((item) =>
                      item.key === row.key ? { ...item, text: event.target.value } : item,
                    ),
                  )
                }
              />
              <div className="flex items-center gap-2">
                <ControlledSelect
                  name={`requirementKind-${row.key}`}
                  value={row.kind}
                  onChange={(kind) =>
                    setRows((current) =>
                      current.map((item) =>
                        item.key === row.key
                          ? { ...item, kind: (kind || "required") as RequirementKind }
                          : item,
                      ),
                    )
                  }
                  options={option(REQUIREMENT_KINDS, "requirementKinds")}
                  className="sm:w-40"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={tForm("removeRequirement", { index: index + 1 })}
                  onClick={() =>
                    setRows((current) => current.filter((item) => item.key !== row.key))
                  }
                >
                  <XIcon aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length >= MAX_REQUIREMENTS}
          onClick={() => {
            setRows((current) => [...current, { key: nextKey, text: "", kind: "required" }]);
            setNextKey((key) => key + 1);
          }}
        >
          <PlusIcon aria-hidden />
          {tForm("addRequirement")}
        </Button>
        <FieldError messages={fieldErrors?.requirements} />
      </section>

      <section className="space-y-3" aria-labelledby="salary-title">
        <div>
          <h2 id="salary-title" className="text-sm font-medium">
            {tForm("salary")} <Optional />
          </h2>
          <p className="text-xs text-muted-foreground">
            {payTransparency ? tForm("salaryHelpEU") : tForm("salaryHelp")}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="salaryMin">{tForm("salaryMin")}</Label>
            <Input
              id="salaryMin"
              name="salaryMin"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              defaultValue={submitted.salaryMin ?? initial.salaryMin}
              aria-invalid={Boolean(fieldErrors?.salaryMin)}
            />
            <FieldError messages={fieldErrors?.salaryMin} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salaryMax">{tForm("salaryMax")}</Label>
            <Input
              id="salaryMax"
              name="salaryMax"
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              defaultValue={submitted.salaryMax ?? initial.salaryMax}
              aria-invalid={Boolean(fieldErrors?.salaryMax)}
            />
            <FieldError messages={fieldErrors?.salaryMax} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salaryCurrency">{tForm("currency")}</Label>
            <ControlledSelect
              id="salaryCurrency"
              name="salaryCurrency"
              value={currency}
              onChange={setCurrency}
              options={currencies.map((code) => ({ value: code, label: code }))}
            />
            <FieldError messages={fieldErrors?.salaryCurrency} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="salaryPeriod">{tForm("period")}</Label>
            <ControlledSelect
              id="salaryPeriod"
              name="salaryPeriod"
              value={period}
              onChange={setPeriod}
              options={option(SALARY_PERIODS, "periods")}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="benefits">
            {tForm("benefits")} <Optional />
          </Label>
          <Textarea
            id="benefits"
            name="benefits"
            rows={3}
            value={benefits}
            onChange={(event) => setBenefits(event.target.value)}
            placeholder={tForm("benefitsPlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tone">{tForm("tone")}</Label>
          <ControlledSelect
            id="tone"
            name="tone"
            value={tone}
            onChange={(value) => setTone((value || "professional") as JobTone)}
            options={option(JOB_TONES, "tones")}
          />
        </div>
      </section>

      {warnings.length > 0 ? (
        <section
          role="status"
          aria-label={tForm("warningsTitle")}
          className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="flex items-center gap-2 font-medium">
            <TriangleAlertIcon className="size-4" aria-hidden />
            {tForm("warningsTitle")}
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((warning) => (
              <li key={warning.key}>
                <strong>«{warning.excerpt}»</strong> —{" "}
                {t(`inclusive.categories.${warning.category}`)}. {warning.suggestion}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <FormMessage status={state.status} message={"message" in state ? state.message : undefined} />
      <SubmitButton pendingLabel={tForm("saving")}>
        {initial.jobId ? tForm("saveChanges") : tForm("create")}
      </SubmitButton>
    </form>
  );
}

function Optional() {
  const t = useTranslations("jobs.form");
  return <span className="font-normal text-muted-foreground">({t("optional")})</span>;
}

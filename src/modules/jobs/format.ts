import type { JobPromptInput } from "@/lib/ai/prompts/jobs/shared";
import { type CountryConfig, type CurrencyCode, formatCurrency } from "@/lib/countries";
import type { JobWithRequirements } from "./queries";

type SalaryFields = Pick<
  JobWithRequirements,
  "salary_min" | "salary_max" | "salary_currency" | "salary_period"
>;

/** "28.000 € – 34.000 € brutos al año" (o null si no hay banda). */
export function formatSalaryRange(job: SalaryFields, country: CountryConfig): string | null {
  if (job.salary_min == null && job.salary_max == null) return null;
  const currency = (job.salary_currency ?? country.defaultCurrency) as CurrencyCode;
  const money = (amount: number) => formatCurrency(Number(amount), currency, country);
  const period = job.salary_period === "month" ? "brutos al mes" : "brutos al año";
  if (job.salary_min != null && job.salary_max != null) {
    return job.salary_min === job.salary_max
      ? `${money(job.salary_min)} ${period}`
      : `${money(job.salary_min)} – ${money(job.salary_max)} ${period}`;
  }
  if (job.salary_min != null) return `Desde ${money(job.salary_min)} ${period}`;
  return `Hasta ${money(job.salary_max!)} ${period}`;
}

/** Ficha del puesto en el formato que esperan los prompts del módulo. */
export function toPromptInput(job: JobWithRequirements, country: CountryConfig): JobPromptInput {
  return {
    title: job.title,
    department: job.department,
    level: job.level,
    workMode: job.work_mode,
    location: job.location,
    responsibilities: job.responsibilities,
    requirements: job.requirements.map((req) => ({ text: req.text, kind: req.kind })),
    salary: formatSalaryRange(job, country),
    benefits: job.benefits,
    tone: job.tone,
  };
}

import type { CountryConfig } from "@/lib/countries/types";
import { checkInclusiveRules, excerptAppearsIn } from "@/lib/inclusive/rules";
import type {
  FindingField,
  InclusiveCategory,
  InclusiveFinding,
  Severity,
} from "@/lib/inclusive/types";
import type { JobDoc } from "./constants";

export type InclusiveNotice = {
  code: "missing_salary_range";
  severity: Severity;
};

/** Lo que se guarda en job_position_versions.inclusive_review. */
export type InclusiveReview = {
  findings: InclusiveFinding[];
  notices: InclusiveNotice[];
  aiReviewed: boolean;
  /** Hallazgos de la IA descartados por no encontrarse literalmente en el texto. */
  aiDiscarded: number;
  reviewedAt: string;
};

export type JobDocs = Record<JobDoc, string>;

export type AiFinding = {
  field: JobDoc;
  excerpt: string;
  category: InclusiveCategory;
  severity: Severity;
  explanation: string;
  suggestion: string;
};

/** Avisos a nivel de puesto (no de texto), p. ej. transparencia salarial en la UE. */
export function jobNotices(
  job: { salary_min: number | null; salary_max: number | null },
  country: CountryConfig,
): InclusiveNotice[] {
  const notices: InclusiveNotice[] = [];
  if (country.employment.payTransparency && job.salary_min == null && job.salary_max == null) {
    notices.push({ code: "missing_salary_range", severity: "medium" });
  }
  return notices;
}

export function docsAsRuleInputs(docs: JobDocs): { field: FindingField; text: string }[] {
  return (Object.keys(docs) as JobDoc[]).map((field) => ({ field, text: docs[field] }));
}

/**
 * Combina la revisión por reglas con la de la IA. De la IA solo se aceptan
 * hallazgos cuyo fragmento aparece literalmente en el texto indicado (evita
 * avisos inventados) y que no repiten un hallazgo de las reglas.
 */
export function buildInclusiveReview(params: {
  docs: JobDocs;
  country: CountryConfig;
  job: { salary_min: number | null; salary_max: number | null };
  aiFindings: AiFinding[] | null;
  now?: Date;
}): InclusiveReview {
  const ruleFindings = checkInclusiveRules(docsAsRuleInputs(params.docs), params.country.code);
  let aiDiscarded = 0;
  const aiFindings: InclusiveFinding[] = [];

  for (const finding of params.aiFindings ?? []) {
    const text = params.docs[finding.field] ?? "";
    if (!excerptAppearsIn(finding.excerpt, text)) {
      aiDiscarded += 1;
      continue;
    }
    const duplicated = ruleFindings.some(
      (rule) =>
        rule.field === finding.field &&
        (excerptAppearsIn(rule.excerpt, finding.excerpt) ||
          excerptAppearsIn(finding.excerpt, rule.excerpt)),
    );
    if (duplicated) continue;
    aiFindings.push({
      ...finding,
      key: `${finding.field}:ai:${finding.excerpt.toLowerCase().replace(/\s+/g, " ").trim()}`,
      source: "ai",
    });
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  const findings = [...ruleFindings, ...aiFindings].sort(
    (a, b) => order[a.severity] - order[b.severity],
  );

  return {
    findings,
    notices: jobNotices(params.job, params.country),
    aiReviewed: params.aiFindings !== null,
    aiDiscarded,
    reviewedAt: (params.now ?? new Date()).toISOString(),
  };
}

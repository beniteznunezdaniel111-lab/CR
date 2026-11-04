export const INCLUSIVE_CATEGORIES = [
  "age",
  "gender",
  "family_marital",
  "origin_nationality",
  "appearance",
  "health_disability",
  "religion_beliefs",
  "salary_history",
  "gendered_language",
  "other",
] as const;
export type InclusiveCategory = (typeof INCLUSIVE_CATEGORIES)[number];

export const SEVERITIES = ["high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Dónde aparece el hallazgo (cada módulo define sus campos, p. ej. "linkedin"). */
export type FindingField = string;

export type InclusiveFinding = {
  /** Clave estable para la interfaz (hash de campo + regla + fragmento). */
  key: string;
  source: "rules" | "ai";
  field: FindingField;
  category: InclusiveCategory;
  severity: Severity;
  /** Fragmento literal del texto revisado. */
  excerpt: string;
  explanation: string;
  suggestion: string;
};

import type { CountryConfig } from "@/lib/countries/types";

export type NoticeOrg = {
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  address: string | null;
  privacy_email: string | null;
  cv_retention_months: number;
};

export const NOTICE_FIELDS = ["legalName", "taxId", "address", "privacyEmail"] as const;
export type NoticeField = (typeof NOTICE_FIELDS)[number];

type Translate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Aviso de privacidad para personas candidatas, en Markdown, a partir de las
 * plantillas del país (messages: candidates.privacyTemplate.<país>) y los datos
 * de la empresa. Es un BORRADOR pendiente de revisión legal: no es asesoramiento.
 * `missing` indica qué datos de la empresa faltan (salen como "[pendiente: ...]").
 */
export function buildCandidatePrivacyNotice({
  template,
  pending,
  org,
  country,
}: {
  /** Traductor del espacio "candidates.privacyTemplate". */
  template: Translate;
  /** Texto para un dato que falta, p. ej. "[pendiente: razón social]". */
  pending: (field: NoticeField) => string;
  org: NoticeOrg;
  country: CountryConfig;
}): { markdown: string; missing: NoticeField[] } {
  const missing: NoticeField[] = [];
  const value = (raw: string | null, field: NoticeField) => {
    if (raw?.trim()) return raw.trim();
    missing.push(field);
    return pending(field);
  };

  const values = {
    company: org.name,
    legalName: value(org.legal_name, "legalName"),
    taxIdLabel: country.taxIdLabel,
    taxId: value(org.tax_id, "taxId"),
    address: value(org.address, "address"),
    privacyEmail: value(org.privacy_email, "privacyEmail"),
    months: org.cv_retention_months,
    authority: country.dataProtection.authority.name,
    authorityUrl: country.dataProtection.authority.url,
    laws: country.dataProtection.laws.map((law) => law.full).join("; "),
  };
  const text = (key: string) => template(`${country.code}.${key}`, values);
  const aiText = country.aiRegulation
    ? `${text("ai")} ${template(`${country.code}.aiRegulation`, {
        regulation: country.aiRegulation.full,
      })}`
    : text("ai");

  const markdown = [
    `# ${text("title")}`,
    `> ${text("draft")}`,
    `## ${text("controllerTitle")}`,
    text("controller"),
    `## ${text("purposeTitle")}`,
    text("purpose"),
    `## ${text("aiTitle")}`,
    aiText,
    `## ${text("legalBasisTitle")}`,
    text("legalBasis"),
    `## ${text("retentionTitle")}`,
    text("retention"),
    `## ${text("recipientsTitle")}`,
    text("recipients"),
    `## ${text("rightsTitle")}`,
    text("rights"),
    `_${text("laws")}_`,
  ].join("\n\n");

  return { markdown, missing };
}

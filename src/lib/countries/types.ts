export const COUNTRY_CODES = ["ES", "CR"] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export type CurrencyCode = "EUR" | "CRC" | "USD";

export type LegalReference = {
  /** Nombre corto para mostrar en la interfaz. */
  short: string;
  /** Referencia completa (pendiente de revisión legal). */
  full: string;
};

/**
 * Configuración por país. Afecta a formatos, textos legales, normativa de
 * referencia y al trato en las salidas de IA. Las referencias legales son
 * orientativas y están PENDIENTES DE REVISIÓN LEGAL: no son asesoramiento.
 */
export type CountryConfig = {
  code: CountryCode;
  name: string;
  /** Locale BCP 47 para Intl (fechas, números, moneda). */
  locale: "es-ES" | "es-CR";
  defaultCurrency: CurrencyCode;
  currencies: readonly CurrencyCode[];
  defaultTimezone: string;
  timezones: readonly string[];
  phonePrefix: string;
  taxIdLabel: string;
  /** Trato en los textos generados por la IA. */
  formOfAddress: "tu" | "usted";
  dataProtection: {
    laws: readonly LegalReference[];
    authority: { name: string; url: string };
  };
  /** Normativa de IA aplicable (si existe). */
  aiRegulation: LegalReference | null;
  employment: {
    antiDiscrimination: readonly LegalReference[];
    /** Obligaciones de transparencia salarial en ofertas (Directiva UE 2023/970). */
    payTransparency: boolean;
    /** Cómo se llama aquí el documento que regula las condiciones laborales. */
    collectiveAgreementLabel: string;
    internalRulesLabel: string;
  };
  pendingLegalReview: true;
};

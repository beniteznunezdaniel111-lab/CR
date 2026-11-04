import type { CountryConfig } from "./types";

export const costaRica: CountryConfig = {
  code: "CR",
  name: "Costa Rica",
  locale: "es-CR",
  defaultCurrency: "CRC",
  currencies: ["CRC", "USD"],
  defaultTimezone: "America/Costa_Rica",
  timezones: ["America/Costa_Rica"],
  phonePrefix: "+506",
  taxIdLabel: "Cédula jurídica",
  formOfAddress: "usted",
  dataProtection: {
    laws: [
      {
        short: "Ley 8968",
        full: "Ley 8968 de Protección de la Persona frente al Tratamiento de sus Datos Personales",
      },
    ],
    authority: {
      name: "Agencia de Protección de Datos de los Habitantes (PRODHAB)",
      url: "https://www.prodhab.go.cr",
    },
  },
  aiRegulation: null,
  employment: {
    antiDiscrimination: [
      {
        short: "Código de Trabajo",
        full: "Código de Trabajo de Costa Rica (prohibición de discriminación en el empleo)",
      },
    ],
    payTransparency: false,
    collectiveAgreementLabel: "Convención colectiva",
    internalRulesLabel: "Reglamento interior de trabajo",
  },
  pendingLegalReview: true,
};

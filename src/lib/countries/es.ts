import type { CountryConfig } from "./types";

export const spain: CountryConfig = {
  code: "ES",
  name: "España",
  locale: "es-ES",
  defaultCurrency: "EUR",
  currencies: ["EUR"],
  defaultTimezone: "Europe/Madrid",
  timezones: ["Europe/Madrid", "Atlantic/Canary"],
  phonePrefix: "+34",
  taxIdLabel: "NIF",
  formOfAddress: "tu",
  dataProtection: {
    laws: [
      {
        short: "RGPD",
        full: "Reglamento (UE) 2016/679, General de Protección de Datos",
      },
      {
        short: "LOPDGDD",
        full: "Ley Orgánica 3/2018, de Protección de Datos Personales y garantía de los derechos digitales",
      },
    ],
    authority: {
      name: "Agencia Española de Protección de Datos (AEPD)",
      url: "https://www.aepd.es",
    },
  },
  aiRegulation: {
    short: "Reglamento de IA",
    full: "Reglamento (UE) 2024/1689 de Inteligencia Artificial (la selección de personal se considera uso de alto riesgo)",
  },
  employment: {
    antiDiscrimination: [
      {
        short: "Ley 15/2022",
        full: "Ley 15/2022, integral para la igualdad de trato y la no discriminación",
      },
      {
        short: "Estatuto de los Trabajadores",
        full: "Real Decreto Legislativo 2/2015, texto refundido del Estatuto de los Trabajadores (arts. 4 y 17)",
      },
    ],
    payTransparency: true,
    collectiveAgreementLabel: "Convenio colectivo",
    internalRulesLabel: "Manual del empleado",
  },
  pendingLegalReview: true,
};

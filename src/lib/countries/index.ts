import { costaRica } from "./cr";
import { spain } from "./es";
import { COUNTRY_CODES, type CountryCode, type CountryConfig, type CurrencyCode } from "./types";

export * from "./types";

const COUNTRIES: Record<CountryCode, CountryConfig> = {
  ES: spain,
  CR: costaRica,
};

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === "string" && (COUNTRY_CODES as readonly string[]).includes(value);
}

export function getCountry(code: CountryCode): CountryConfig {
  return COUNTRIES[code];
}

/** Para datos que vienen de la base de datos (texto libre validado por CHECK). */
export function getCountryOrDefault(code: string | null | undefined): CountryConfig {
  return isCountryCode(code) ? COUNTRIES[code] : spain;
}

export function listCountries(): CountryConfig[] {
  return COUNTRY_CODES.map((code) => COUNTRIES[code]);
}

export function formatDate(
  value: Date | string,
  country: CountryConfig,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(country.locale, options).format(date);
}

export function formatCurrency(
  amount: number,
  currency: CurrencyCode,
  country: CountryConfig,
): string {
  // Importes redondos (salarios) sin decimales; los colones nunca llevan decimales.
  const decimals = currency === "CRC" || Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(country.locale, {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatNumber(value: number, country: CountryConfig): string {
  return new Intl.NumberFormat(country.locale).format(value);
}

import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  getCountry,
  getCountryOrDefault,
  isCountryCode,
  listCountries,
} from "@/lib/countries";

describe("configuración por país", () => {
  it("solo admite ES y CR", () => {
    expect(listCountries().map((country) => country.code)).toEqual(["ES", "CR"]);
    expect(isCountryCode("ES")).toBe(true);
    expect(isCountryCode("MX")).toBe(false);
    expect(getCountryOrDefault("XX").code).toBe("ES");
  });

  it("cada país tiene moneda, zona horaria y autoridad de protección de datos coherentes", () => {
    for (const country of listCountries()) {
      expect(country.currencies).toContain(country.defaultCurrency);
      expect(country.timezones).toContain(country.defaultTimezone);
      expect(country.dataProtection.laws.length).toBeGreaterThan(0);
      expect(country.dataProtection.authority.url).toMatch(/^https:\/\//);
      expect(country.pendingLegalReview).toBe(true);
    }
  });

  it("España: RGPD, Reglamento de IA y transparencia salarial; Costa Rica: Ley 8968", () => {
    const es = getCountry("ES");
    const cr = getCountry("CR");
    expect(es.dataProtection.laws.map((law) => law.short)).toContain("RGPD");
    expect(es.aiRegulation?.full).toMatch(/2024\/1689/);
    expect(es.employment.payTransparency).toBe(true);
    expect(cr.dataProtection.laws.map((law) => law.short)).toContain("Ley 8968");
    expect(cr.employment.payTransparency).toBe(false);
    expect(cr.formOfAddress).toBe("usted");
  });

  it("formatea moneda y fechas con las convenciones locales", () => {
    const es = getCountry("ES");
    const cr = getCountry("CR");
    expect(formatCurrency(1234.5, "EUR", es)).toMatch(/1234,50|1\.234,50/);
    expect(formatCurrency(1234.5, "EUR", es)).toContain("€");
    // Los colones no llevan decimales.
    expect(formatCurrency(500000.4, "CRC", cr)).not.toMatch(/,\d{2}\s*$/);
    expect(formatCurrency(500000.4, "CRC", cr)).toContain("₡");
    expect(formatDate("2026-03-15T12:00:00Z", es, { dateStyle: "short", timeZone: "UTC" })).toBe(
      "15/3/26",
    );
  });
});

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/config/brand";
import { listCountries } from "@/lib/countries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.privacy");
  return { title: t("title") };
}

// TEXTO PROVISIONAL — PENDIENTE DE REVISIÓN LEGAL. No usar con clientes reales tal cual.
export default async function PrivacyPage() {
  const t = await getTranslations("legal.privacy");
  const sections = [
    "controller",
    "data",
    "purposes",
    "ai",
    "processors",
    "retention",
    "rights",
  ] as const;
  return (
    <>
      <h1>{t("title")}</h1>
      <p>{t("intro", { app: APP_NAME })}</p>
      {sections.map((section) => (
        <section key={section}>
          <h2>{t(`sections.${section}.title`)}</h2>
          <p>{t(`sections.${section}.body`, { app: APP_NAME })}</p>
        </section>
      ))}
      <section>
        <h2>{t("byCountry")}</h2>
        <ul className="list-disc space-y-2 pl-5">
          {listCountries().map((country) => (
            <li key={country.code}>
              <strong>{country.name}:</strong>{" "}
              {country.dataProtection.laws.map((law) => law.full).join("; ")}. {t("authority")}:{" "}
              <a href={country.dataProtection.authority.url} className="text-primary underline">
                {country.dataProtection.authority.name}
              </a>
              .
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

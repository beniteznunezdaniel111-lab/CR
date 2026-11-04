import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { APP_NAME } from "@/lib/config/brand";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.terms");
  return { title: t("title") };
}

// TEXTO PROVISIONAL — PENDIENTE DE REVISIÓN LEGAL. No usar con clientes reales tal cual.
export default async function TermsPage() {
  const t = await getTranslations("legal.terms");
  const sections = ["service", "accounts", "ai", "data", "liability", "changes"] as const;
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
    </>
  );
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { getCountryOrDefault, listCountries } from "@/lib/countries";
import type { CurrencyCode } from "@/lib/countries/types";
import { CloseOrganization } from "./close-organization";
import { type CountryOptions, OrgSettingsForm } from "./org-settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orgSettings");
  return { title: t("title") };
}

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const { org } = await requireOrgRole(slug, ADMIN_ROLES);
  const t = await getTranslations("orgSettings");

  const countryOptions = Object.fromEntries(
    listCountries().map((country) => [
      country.code,
      {
        currencies: country.currencies,
        timezones: country.timezones,
        defaultCurrency: country.defaultCurrency,
        defaultTimezone: country.defaultTimezone,
      },
    ]),
  ) as CountryOptions;
  const country = getCountryOrDefault(org.country);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card>
        <CardContent>
          <OrgSettingsForm
            countryOptions={countryOptions}
            initial={{
              orgId: org.id,
              name: org.name,
              country: country.code,
              legalName: org.legal_name ?? "",
              taxId: org.tax_id ?? "",
              address: org.address ?? "",
              privacyEmail: org.privacy_email ?? "",
              timezone: org.timezone,
              currency: org.currency as CurrencyCode,
              cvRetentionMonths: org.cv_retention_months,
            }}
          />
        </CardContent>
      </Card>
      <div className="mt-6">
        <CloseOrganization orgId={org.id} name={org.name} />
      </div>
    </>
  );
}

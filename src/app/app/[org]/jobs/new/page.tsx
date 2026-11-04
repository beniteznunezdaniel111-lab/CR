import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { JobForm } from "../job-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("jobs");
  return { title: t("newJob") };
}

export default async function NewJobPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("jobs");

  return (
    <>
      <PageHeader title={t("newJob")} description={t("form.description")} />
      <Card>
        <CardContent>
          <JobForm
            orgId={org.id}
            country={country.code}
            currencies={country.currencies}
            payTransparency={country.employment.payTransparency}
            initial={{
              title: "",
              department: "",
              level: "",
              workMode: "",
              location: "",
              responsibilities: "",
              requirements: [],
              salaryMin: "",
              salaryMax: "",
              salaryCurrency: country.defaultCurrency,
              salaryPeriod: "year",
              benefits: "",
              tone: "professional",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

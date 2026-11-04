import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import type { CurrencyCode } from "@/lib/countries/types";
import type { SalaryPeriod } from "@/modules/jobs/constants";
import { getJob } from "@/modules/jobs/queries";
import { JobForm } from "../../job-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("jobs");
  return { title: t("editJob") };
}

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ org: string; jobId: string }>;
}) {
  const { org: slug, jobId } = await params;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const job = await getJob(org.id, jobId);
  if (!job) notFound();
  const t = await getTranslations("jobs");

  return (
    <>
      <PageHeader title={t("editJob")} description={job.title} />
      <Card>
        <CardContent>
          <JobForm
            orgId={org.id}
            country={country.code}
            currencies={country.currencies}
            payTransparency={country.employment.payTransparency}
            initial={{
              jobId: job.id,
              title: job.title,
              department: job.department ?? "",
              level: job.level,
              workMode: job.work_mode,
              location: job.location ?? "",
              responsibilities: job.responsibilities,
              requirements: job.requirements.map((req) => ({
                id: req.id,
                text: req.text,
                kind: req.kind,
              })),
              salaryMin: job.salary_min?.toString() ?? "",
              salaryMax: job.salary_max?.toString() ?? "",
              salaryCurrency:
                (job.salary_currency as CurrencyCode | null) ?? country.defaultCurrency,
              salaryPeriod: (job.salary_period as SalaryPeriod | null) ?? "year",
              benefits: job.benefits ?? "",
              tone: job.tone,
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}

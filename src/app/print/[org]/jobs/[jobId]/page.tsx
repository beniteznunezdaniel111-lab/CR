import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/config/brand";
import { formatDate } from "@/lib/countries";
import { JOB_DOC_COLUMNS, JOB_DOCS, type JobDoc } from "@/modules/jobs/constants";
import { getJob, getJobVersion } from "@/modules/jobs/queries";
import { PrintButton } from "../../../print-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("print");
  return { title: t("title") };
}

export default async function PrintJobPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; jobId: string }>;
  searchParams: Promise<{ v?: string; doc?: string }>;
}) {
  const { org: slug, jobId } = await params;
  const { v, doc } = await searchParams;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("jobs");

  const job = await getJob(org.id, jobId);
  const version = job
    ? await getJobVersion(org.id, jobId, v && /^\d+$/.test(v) ? Number(v) : undefined)
    : null;
  if (!job || !version) notFound();

  const docs: JobDoc[] =
    doc && (JOB_DOCS as readonly string[]).includes(doc) ? [doc as JobDoc] : [...JOB_DOCS];

  return (
    <>
      <PrintButton />
      {docs.map((item, index) => (
        <article key={item} className={index > 0 ? "mt-10 break-before-page" : undefined}>
          <header className="mb-6 border-b pb-3">
            <p className="text-xs text-muted-foreground uppercase">
              {org.name} · {t(`inclusive.docs.${item}`)}
            </p>
            <h1 className="text-2xl font-semibold">{job.title}</h1>
          </header>
          <MarkdownView markdown={version[JOB_DOC_COLUMNS[item]]} />
        </article>
      ))}
      <footer className="mt-10 border-t pt-3 text-xs text-muted-foreground">
        {t("printFooter", {
          app: APP_NAME,
          version: version.version_number,
          date: formatDate(version.created_at, country, {
            dateStyle: "medium",
            timeZone: org.timezone,
          }),
        })}
      </footer>
    </>
  );
}

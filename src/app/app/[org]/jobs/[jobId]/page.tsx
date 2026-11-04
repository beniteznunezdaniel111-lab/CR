import { FileSearchIcon, SparklesIcon, UsersRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { JOB_DOC_COLUMNS, JOB_DOCS } from "@/modules/jobs/constants";
import { formatSalaryRange } from "@/modules/jobs/format";
import { type JobDocs, jobNotices } from "@/modules/jobs/inclusive-review";
import { getJob, getJobVersion, listJobVersions } from "@/modules/jobs/queries";
import { JobStatusBadge } from "../job-status-badge";
import { ContentWorkspace } from "./content-workspace";
import { GenerateButton } from "./generate-button";
import { JobActions } from "./job-actions";

// Generar con IA hace dos llamadas al modelo: margen para las funciones de Vercel.
export const maxDuration = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; jobId: string }>;
}): Promise<Metadata> {
  const { org: slug, jobId } = await params;
  const t = await getTranslations("jobs");
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const job = await getJob(org.id, jobId);
  return { title: job?.title ?? t("job") };
}

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string; jobId: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const { org: slug, jobId } = await params;
  const { v } = await searchParams;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("jobs");

  const job = await getJob(org.id, jobId);
  if (!job) notFound();

  const requested = v && /^\d+$/.test(v) ? Number(v) : undefined;
  const [versions, version] = await Promise.all([
    listJobVersions(org.id, jobId),
    getJobVersion(org.id, jobId, requested),
  ]);
  if (requested && !version) notFound();

  // Nombres de quienes crearon cada versión (RRHH puede ver perfiles de su empresa).
  const authorIds = [
    ...new Set(versions.map((item) => item.created_by).filter(Boolean)),
  ] as string[];
  const supabase = await createClient();
  const { data: authors } = authorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", authorIds)
    : { data: [] };
  const authorName = (id: string | null) => {
    const author = authors?.find((item) => item.id === id);
    return author?.full_name ?? author?.email ?? t("unknownAuthor");
  };
  const when = (iso: string) =>
    formatDate(iso, country, { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone });
  const sourceLabel = (source: string, restoredFrom: number | null) =>
    source === "restored"
      ? t("versionSource.restored", { from: restoredFrom ?? 0 })
      : t(`versionSource.${source}`);

  const salary = formatSalaryRange(job, country);
  const notices = jobNotices(job, country);
  const latestNumber = versions[0]?.version_number ?? 0;

  return (
    <>
      <PageHeader
        title={job.title}
        description={[
          job.department,
          t(`levels.${job.level}`),
          t(`workModes.${job.work_mode}`),
          job.location,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <JobActions
            orgId={org.id}
            jobId={job.id}
            status={job.status}
            editHref={orgPath(slug, `/jobs/${job.id}/edit`)}
          />
        }
      />

      <div className="space-y-6">
        {version ? (
          <ContentWorkspace
            key={version.version_number}
            orgId={org.id}
            jobId={job.id}
            jobTitle={job.title}
            isLatest={version.version_number === latestNumber}
            latestNumber={latestNumber}
            printHref={`/print/${slug}/jobs/${job.id}`}
            versions={versions.map((item) => ({
              number: item.version_number,
              label: t("versionOption", {
                version: item.version_number,
                source: sourceLabel(item.source, item.restored_from_version),
                date: when(item.created_at),
              }),
            }))}
            version={{
              number: version.version_number,
              source: version.source,
              metaLabel: [
                t("versionOf", { version: version.version_number, total: latestNumber }),
                sourceLabel(version.source, version.restored_from_version),
                version.source === "ai" && version.model
                  ? t("aiTrace", {
                      prompt: `${version.prompt_id}@${version.prompt_version}`,
                      model: version.model,
                    })
                  : null,
                when(version.created_at),
                authorName(version.created_by),
              ]
                .filter(Boolean)
                .join(" · "),
              docs: Object.fromEntries(
                JOB_DOCS.map((doc) => [doc, version[JOB_DOC_COLUMNS[doc]]]),
              ) as JobDocs,
              review: version.inclusive_review,
            }}
          />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
                <SparklesIcon className="size-5" aria-hidden />
              </span>
              <h2 className="text-lg font-medium">{t("noContent.title")}</h2>
              <p className="max-w-lg text-sm text-muted-foreground">{t("noContent.description")}</p>
              <GenerateButton orgId={org.id} jobId={job.id} hasContent={false} />
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t("summary.title")} <JobStatusBadge status={job.status} />
              </CardTitle>
              <CardDescription>{t("summary.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("form.salary")}</dt>
                  <dd>{salary ?? t("summary.noSalary")}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("form.tone")}</dt>
                  <dd>{t(`tones.${job.tone}`)}</dd>
                </div>
              </dl>
              {notices.map((notice) => (
                <p
                  key={notice.code}
                  className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900"
                >
                  {t(`inclusive.notices.${notice.code}`)}
                </p>
              ))}
              <div>
                <h3 className="mb-2 text-xs text-muted-foreground">{t("form.requirements")}</h3>
                {job.requirements.length === 0 ? (
                  <p className="text-muted-foreground">{t("summary.noRequirements")}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {job.requirements.map((req) => (
                      <li key={req.id} className="flex items-start gap-2">
                        <Badge variant={req.kind === "required" ? "default" : "secondary"}>
                          {t(`requirementKinds.${req.kind}`)}
                        </Badge>
                        <span>{req.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("modules.title")}</CardTitle>
              <CardDescription>{t("modules.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-3 rounded-md border p-3">
                <FileSearchIcon className="size-4 text-primary" aria-hidden />
                <span className="flex-1">{t("modules.candidates")}</span>
                <Badge variant="secondary">{t("modules.soon", { phase: 2 })}</Badge>
              </div>
              <div className="flex items-center gap-3 rounded-md border p-3">
                <UsersRoundIcon className="size-4 text-primary" aria-hidden />
                <span className="flex-1">{t("modules.interviews")}</span>
                <Badge variant="secondary">{t("modules.soon", { phase: 3 })}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

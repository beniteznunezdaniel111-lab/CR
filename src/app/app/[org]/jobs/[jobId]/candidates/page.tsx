import { ArrowLeftIcon, ShieldCheckIcon, UsersRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { AiSuggestionNotice } from "@/components/candidates/ai-notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { listJobCandidates } from "@/modules/candidates/queries";
import { getJob } from "@/modules/jobs/queries";
import { AnonymousReview } from "./anonymous-review";
import { CandidatesTable, type PipelineRow } from "./candidates-table";
import { CvUploader } from "./cv-uploader";

// El análisis de cada CV (dos llamadas a la IA) se ejecuta desde esta página.
export const maxDuration = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; jobId: string }>;
}): Promise<Metadata> {
  const { org: slug, jobId } = await params;
  const t = await getTranslations("candidates");
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const job = await getJob(org.id, jobId);
  return { title: job ? t("jobTitle", { title: job.title }) : t("title") };
}

export default async function JobCandidatesPage({
  params,
}: {
  params: Promise<{ org: string; jobId: string }>;
}) {
  const { org: slug, jobId } = await params;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("candidates");

  const job = await getJob(org.id, jobId);
  if (!job) notFound();
  const candidates = await listJobCandidates(org.id, jobId);

  const rows: PipelineRow[] = candidates.map((candidate) => {
    const alias = t("candidateAlias", { number: candidate.number });
    const failedMessage =
      candidate.processingStatus === "failed" && candidate.processingError
        ? t(`processingErrors.${candidate.processingError}` as string)
        : null;
    return {
      id: candidate.id,
      title: candidate.name ?? alias,
      // En modo anónimo no se muestra ni el nombre del fichero (suele llevar el nombre).
      subtitle: candidate.identityVisible ? candidate.filename : null,
      status: candidate.status,
      processingStatus: candidate.processingStatus,
      processingMessage: failedMessage,
      canProcess:
        candidate.processingStatus === "pending" ||
        candidate.processingStatus === "failed" ||
        candidate.stale,
      counts: candidate.counts,
      uploaded: formatDate(candidate.createdAt, country, {
        dateStyle: "medium",
        timeZone: org.timezone,
      }),
      href: orgPath(slug, `/jobs/${jobId}/candidates/${candidate.id}`),
    };
  });

  return (
    <>
      <PageHeader
        title={t("jobTitle", { title: job.title })}
        description={t("jobDescription")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={orgPath(slug, `/jobs/${jobId}`)}>
                <ArrowLeftIcon aria-hidden />
                {t("backToJob")}
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href={orgPath(slug, "/candidates/privacy-notice")}>
                <ShieldCheckIcon aria-hidden />
                {t("privacyNoticeLink")}
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <AiSuggestionNotice />

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("upload.title")}</CardTitle>
              <CardDescription>{t("upload.privacyHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              {job.requirements.length === 0 ? (
                <div className="space-y-3 text-sm">
                  <p>{t("upload.noRequirements")}</p>
                  <Button asChild size="sm">
                    <Link href={orgPath(slug, `/jobs/${jobId}/edit`)}>{t("upload.editJob")}</Link>
                  </Button>
                </div>
              ) : (
                <CvUploader orgId={org.id} jobId={jobId} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <AnonymousReview
                orgId={org.id}
                jobId={jobId}
                enabled={job.anonymous_review}
                hasCandidates={candidates.length > 0}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("pipeline.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
                  <UsersRoundIcon className="size-5" aria-hidden />
                </span>
                <h2 className="text-lg font-medium">{t("pipeline.empty.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("pipeline.empty.description")}</p>
              </div>
            ) : (
              <CandidatesTable orgId={org.id} rows={rows} />
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          {t("pipeline.retention", { months: org.cv_retention_months })}
        </p>
      </div>
    </>
  );
}

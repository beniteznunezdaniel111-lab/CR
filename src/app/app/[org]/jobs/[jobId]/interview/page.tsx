import {
  ArrowLeftIcon,
  MessagesSquareIcon,
  PrinterIcon,
  ShieldAlertIcon,
  SparklesIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { GuideView } from "@/components/interviews/guide-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGuide, listGuideCandidates, listJobGuides } from "@/modules/interviews/queries";
import { getJob } from "@/modules/jobs/queries";
import { GenerateGuide, GuidePicker } from "./guide-controls";

export const maxDuration = 120;

type Params = Promise<{ org: string; jobId: string }>;
type Search = Promise<{ guide?: string; candidate?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { org: slug, jobId } = await params;
  const t = await getTranslations("interviews");
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const job = await getJob(org.id, jobId);
  return { title: job ? t("pageTitle", { title: job.title }) : t("title") };
}

export default async function InterviewPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { org: slug, jobId } = await params;
  const { guide: guideParam, candidate: candidateParam } = await searchParams;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("interviews");

  const job = await getJob(org.id, jobId);
  if (!job) notFound();
  const [guides, candidates] = await Promise.all([
    listJobGuides(org.id, jobId),
    listGuideCandidates(org.id, jobId),
  ]);
  const selectedId =
    guideParam && guides.some((guide) => guide.id === guideParam) ? guideParam : guides[0]?.id;
  const guide = selectedId ? await getGuide(org.id, selectedId) : null;

  const when = (iso: string) =>
    formatDate(iso, country, { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone });
  const candidateLabel = (id: string | null) => {
    const option = candidates.find((candidate) => candidate.id === id);
    if (!option) return t("targetJob");
    return option.name ?? t("generate.alias", { number: option.number });
  };

  let authorName: string | null = null;
  if (guide?.created_by) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", guide.created_by)
      .maybeSingle();
    authorName = data ? (data.full_name ?? data.email) : null;
  }

  return (
    <>
      <PageHeader
        title={t("pageTitle", { title: job.title })}
        description={t("description")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={orgPath(slug, `/jobs/${jobId}`)}>
                <ArrowLeftIcon aria-hidden />
                {t("backToJob")}
              </Link>
            </Button>
            {guide ? (
              <Button asChild variant="outline">
                <Link href={`/print/${slug}/interview-guides/${guide.id}`} target="_blank">
                  <PrinterIcon aria-hidden />
                  {t("print")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {guide ? (
            <>
              <GuidePicker
                value={guide.id}
                options={guides.map((item) => ({
                  value: item.id,
                  label: t("versionOption", {
                    date: when(item.createdAt),
                    target: candidateLabel(item.candidateId),
                  }),
                }))}
              />
              <p className="flex items-start gap-2 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
                <SparklesIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t("aiDraft")}
              </p>
              {guide.candidate_id ? (
                <p className="text-sm font-medium">
                  {t("forCandidate", { candidate: candidateLabel(guide.candidate_id) })}
                </p>
              ) : null}
              {guide.guardFlags.length > 0 ? (
                <p className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                  <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {t("guard", { count: guide.guardFlags.length })}
                </p>
              ) : null}
              <Card>
                <CardContent>
                  <GuideView content={guide.content} />
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                {t("trace", {
                  prompt: `${guide.prompt_id}@${guide.prompt_version}`,
                  model: guide.model,
                  date: when(guide.created_at),
                  person: authorName ?? t("unknownPerson"),
                })}
              </p>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
                  <MessagesSquareIcon className="size-5" aria-hidden />
                </span>
                <h2 className="text-lg font-medium">{t("empty.title")}</h2>
                <p className="max-w-lg text-sm text-muted-foreground">{t("empty.description")}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("generate.title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <GenerateGuide
              orgId={org.id}
              jobId={jobId}
              initialCandidate={
                candidateParam && candidates.some((option) => option.id === candidateParam)
                  ? candidateParam
                  : null
              }
              candidates={candidates.map((option) => ({
                id: option.id,
                analyzed: option.analyzed,
                label: option.name ?? t("generate.alias", { number: option.number }),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

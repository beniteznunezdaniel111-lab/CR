import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GuideView } from "@/components/interviews/guide-view";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { APP_NAME } from "@/lib/config/brand";
import { formatDate } from "@/lib/countries";
import { getGuide, listGuideCandidates } from "@/modules/interviews/queries";
import { getJob } from "@/modules/jobs/queries";
import { PrintButton } from "../../../print-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("interviews");
  return { title: t("title") };
}

export default async function PrintGuidePage({
  params,
}: {
  params: Promise<{ org: string; guideId: string }>;
}) {
  const { org: slug, guideId } = await params;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("interviews");

  const guide = await getGuide(org.id, guideId);
  if (!guide) notFound();
  const [job, candidates] = await Promise.all([
    getJob(org.id, guide.job_id),
    guide.candidate_id ? listGuideCandidates(org.id, guide.job_id) : Promise.resolve([]),
  ]);
  if (!job) notFound();
  const candidate = candidates.find((option) => option.id === guide.candidate_id);

  return (
    <>
      <PrintButton />
      <header className="mb-6 border-b pb-3">
        <p className="text-xs text-muted-foreground uppercase">
          {org.name} · {t("title")}
        </p>
        <h1 className="text-2xl font-semibold">{job.title}</h1>
        {candidate ? (
          <p className="text-sm">
            {t("forCandidate", {
              candidate: candidate.name ?? t("generate.alias", { number: candidate.number }),
            })}
          </p>
        ) : null}
      </header>
      <GuideView content={guide.content} printable />
      <footer className="mt-10 border-t pt-3 text-xs text-muted-foreground">
        {t("printFooter", {
          app: APP_NAME,
          date: formatDate(guide.created_at, country, {
            dateStyle: "medium",
            timeZone: org.timezone,
          }),
        })}
      </footer>
    </>
  );
}

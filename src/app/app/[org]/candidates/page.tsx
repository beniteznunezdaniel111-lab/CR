import { BriefcaseIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { AiSuggestionNotice } from "@/components/candidates/ai-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { orgPath } from "@/lib/navigation";
import { getCandidatesOverview } from "@/modules/candidates/queries";
import { JobStatusBadge } from "../jobs/job-status-badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("candidates");
  return { title: t("title") };
}

export default async function CandidatesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("candidates");
  const overview = await getCandidatesOverview(org.id);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild variant="outline">
            <Link href={orgPath(slug, "/candidates/privacy-notice")}>
              <ShieldCheckIcon aria-hidden />
              {t("privacyNoticeLink")}
            </Link>
          </Button>
        }
      />
      <div className="space-y-6">
        <AiSuggestionNotice />
        {overview.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
                <BriefcaseIcon className="size-5" aria-hidden />
              </span>
              <h2 className="text-lg font-medium">{t("overview.empty.title")}</h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {t("overview.empty.description")}
              </p>
              <Button asChild>
                <Link href={orgPath(slug, "/jobs/new")}>{t("overview.empty.action")}</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("overview.table.job")}</TableHead>
                    <TableHead>{t("overview.table.total")}</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      {t("overview.table.pending")}
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      {t("overview.table.reviewed")}
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      {t("overview.table.advance")}
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      {t("overview.table.noAdvance")}
                    </TableHead>
                    <TableHead>
                      <span className="sr-only">{t("overview.open")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overview.map((job) => {
                    const href = orgPath(slug, `/jobs/${job.jobId}/candidates`);
                    return (
                      <TableRow key={job.jobId}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={href} className="font-medium hover:underline">
                              {job.title}
                            </Link>
                            <JobStatusBadge status={job.jobStatus} />
                            {job.anonymous ? (
                              <Badge variant="secondary">{t("anonymous.badge")}</Badge>
                            ) : null}
                          </div>
                          {job.failed > 0 ? (
                            <p className="text-xs text-destructive">
                              {t("overview.failed", { count: job.failed })}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular-nums">{job.total}</TableCell>
                        <TableCell className="hidden tabular-nums sm:table-cell">
                          {job.byStatus.pending}
                        </TableCell>
                        <TableCell className="hidden tabular-nums md:table-cell">
                          {job.byStatus.reviewed}
                        </TableCell>
                        <TableCell className="hidden tabular-nums md:table-cell">
                          {job.byStatus.advance}
                        </TableCell>
                        <TableCell className="hidden tabular-nums md:table-cell">
                          {job.byStatus.no_advance}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={href}>{t("overview.open")}</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

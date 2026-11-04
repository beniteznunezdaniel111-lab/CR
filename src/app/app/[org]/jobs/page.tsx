import { FileTextIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
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
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { listJobs } from "@/modules/jobs/queries";
import { JobStatusBadge } from "./job-status-badge";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("jobs");
  return { title: t("title") };
}

export default async function JobsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("jobs");
  const jobs = await listJobs(org.id);

  const newJobButton = (
    <Button asChild>
      <Link href={orgPath(slug, "/jobs/new")}>
        <PlusIcon aria-hidden />
        {t("newJob")}
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={newJobButton} />
      {jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
              <FileTextIcon className="size-5" aria-hidden />
            </span>
            <h2 className="text-lg font-medium">{t("empty.title")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty.description")}</p>
            {newJobButton}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.title")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("table.department")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("table.level")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("table.content")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-medium">
                      <Link href={orgPath(slug, `/jobs/${job.id}`)} className="hover:underline">
                        {job.title}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{job.department ?? "—"}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      {t(`levels.${job.level}`)}
                    </TableCell>
                    <TableCell>
                      <JobStatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {job.latestVersion && job.latestVersionAt ? (
                        t("table.version", {
                          version: job.latestVersion,
                          date: formatDate(job.latestVersionAt, country, {
                            dateStyle: "medium",
                            timeZone: org.timezone,
                          }),
                        })
                      ) : (
                        <Badge variant="outline">{t("table.noContent")}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

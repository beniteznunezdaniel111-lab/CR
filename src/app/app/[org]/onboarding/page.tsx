import { ClipboardListIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { todayIn } from "@/modules/onboarding/plan";
import { listAssignments, listPlans } from "@/modules/onboarding/queries";
import { NewPlan } from "./onboarding-controls";
import { ProgressBar } from "./progress-bar";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { org: slug } = await params;
  const { job: jobParam } = await searchParams;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("onboarding");
  const today = todayIn(org.timezone);
  const [jobs, plans, assignments] = await Promise.all([
    listJobs(org.id),
    listPlans(org.id),
    listAssignments(org.id, today),
  ]);
  const date = (value: string) =>
    formatDate(`${value}T12:00:00Z`, country, { dateStyle: "medium", timeZone: "UTC" });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("assignments.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("assignments.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("assignments.person")}</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        {t("assignments.start")}
                      </TableHead>
                      <TableHead>{t("assignments.progress")}</TableHead>
                      <TableHead className="hidden md:table-cell">
                        {t("assignments.next")}
                      </TableHead>
                      <TableHead>
                        <span className="sr-only">{t("assignments.open")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((assignment) => {
                      const href = orgPath(slug, `/onboarding/assignments/${assignment.id}`);
                      return (
                        <TableRow key={assignment.id}>
                          <TableCell>
                            <Link href={href} className="font-medium hover:underline">
                              {assignment.employeeName}
                            </Link>
                            <p className="text-xs text-muted-foreground">{assignment.planTitle}</p>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {date(assignment.startDate)}
                          </TableCell>
                          <TableCell className="min-w-36">
                            <ProgressBar
                              percent={assignment.progress.percent}
                              label={t("assignments.progressValue", {
                                done: assignment.progress.done,
                                total: assignment.progress.total,
                              })}
                            />
                            {assignment.overdue > 0 ? (
                              <p className="text-xs text-destructive">
                                {t("assignments.overdue", { count: assignment.overdue })}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="hidden text-sm md:table-cell">
                            {assignment.nextTask ? (
                              <>
                                {assignment.nextTask.title}
                                <span className="block text-xs text-muted-foreground">
                                  {date(assignment.nextTask.dueDate)}
                                </span>
                              </>
                            ) : (
                              t("assignments.done")
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild size="sm" variant="ghost">
                              <Link href={href}>{t("assignments.open")}</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>{t("newPlan.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {jobs.length === 0 ? (
                <div className="space-y-3 text-sm">
                  <p>{t("newPlan.noJobs")}</p>
                  <Button asChild size="sm">
                    <Link href={orgPath(slug, "/jobs/new")}>{t("newPlan.createJob")}</Link>
                  </Button>
                </div>
              ) : (
                <NewPlan
                  orgId={org.id}
                  orgSlug={slug}
                  jobs={jobs.map((job) => ({ id: job.id, title: job.title }))}
                  initialJob={jobs.some((job) => job.id === jobParam) ? (jobParam ?? null) : null}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("plans.title")}</CardTitle>
            <CardDescription>{t("newPlan.help")}</CardDescription>
          </CardHeader>
          <CardContent>
            {plans.length === 0 ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <ClipboardListIcon className="size-4" aria-hidden />
                {t("plans.empty")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("plans.title")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("plans.job")}</TableHead>
                    <TableHead>{t("plans.tasks")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("plans.assignments")}</TableHead>
                    <TableHead>
                      <span className="sr-only">{t("plans.open")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.map((plan) => {
                    const href = orgPath(slug, `/onboarding/plans/${plan.id}`);
                    return (
                      <TableRow key={plan.id}>
                        <TableCell>
                          <Link href={href} className="font-medium hover:underline">
                            {plan.title}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">{plan.jobTitle}</TableCell>
                        <TableCell className="tabular-nums">{plan.tasks}</TableCell>
                        <TableCell className="hidden tabular-nums sm:table-cell">
                          {plan.assignments}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={href}>{t("plans.open")}</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

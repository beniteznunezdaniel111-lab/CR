import { ArrowLeftIcon, FlagIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { deleteOnboardingAssignmentAction } from "@/modules/onboarding/actions";
import { ONBOARDING_PHASES, progressOf, todayIn } from "@/modules/onboarding/plan";
import { getAssignment } from "@/modules/onboarding/queries";
import { ConfirmDelete, TaskDone } from "../../onboarding-controls";
import { ProgressBar } from "../../progress-bar";

type Params = Promise<{ org: string; assignmentId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { org: slug, assignmentId } = await params;
  const t = await getTranslations("onboarding");
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const assignment = await getAssignment(org.id, assignmentId);
  return {
    title: assignment ? t("assignment.pageTitle", { name: assignment.employee_name }) : t("title"),
  };
}

export default async function OnboardingAssignmentPage({ params }: { params: Params }) {
  const { org: slug, assignmentId } = await params;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("onboarding");
  const assignment = await getAssignment(org.id, assignmentId);
  if (!assignment) notFound();

  const today = todayIn(org.timezone);
  const progress = progressOf(assignment.tasks);
  const date = (value: string) =>
    formatDate(`${value}T12:00:00Z`, country, { dateStyle: "medium", timeZone: "UTC" });
  const when = (iso: string) =>
    formatDate(iso, country, { dateStyle: "medium", timeZone: org.timezone });

  return (
    <>
      <PageHeader
        title={t("assignment.pageTitle", { name: assignment.employee_name })}
        description={t("assignment.description", {
          plan: assignment.plan_title,
          date: date(assignment.start_date),
        })}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={orgPath(slug, "/onboarding")}>
                <ArrowLeftIcon aria-hidden />
                {t("title")}
              </Link>
            </Button>
            {assignment.plan_id ? (
              <Button asChild variant="ghost">
                <Link href={orgPath(slug, `/onboarding/plans/${assignment.plan_id}`)}>
                  {t("assignment.planLink")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      <div className="space-y-6">
        <Card>
          <CardContent className="space-y-2 text-sm">
            <ProgressBar
              percent={progress.percent}
              ariaLabel={t("assignment.progressLabel")}
              label={t("assignment.progress", { done: progress.done, total: progress.total })}
            />
            <p className="text-muted-foreground">
              {assignment.memberName
                ? t("assignment.linked", { name: assignment.memberName })
                : t("assignment.noAccount")}
              {assignment.employee_email
                ? ` · ${t("assignment.email", { email: assignment.employee_email })}`
                : null}
            </p>
          </CardContent>
        </Card>

        {ONBOARDING_PHASES.map((phase) => {
          const tasks = assignment.tasks.filter((task) => task.phase === phase);
          if (tasks.length === 0) return null;
          return (
            <Card key={phase}>
              <CardHeader>
                <CardTitle>{t(`phases.${phase}`)}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y" aria-label={t(`phases.${phase}`)}>
                  {tasks.map((task) => {
                    const overdue = !task.completed_at && task.due_date < today;
                    return (
                      <li key={task.id} className="flex gap-3 py-3" data-testid="onboarding-task">
                        <div className="pt-0.5">
                          <TaskDone
                            orgId={org.id}
                            taskId={task.id}
                            title={task.title}
                            done={Boolean(task.completed_at)}
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                "font-medium",
                                task.completed_at && "text-muted-foreground line-through",
                              )}
                            >
                              {task.title}
                            </span>
                            {task.is_checkpoint ? (
                              <Badge variant="secondary">
                                <FlagIcon aria-hidden />
                                {t("assignment.checkpoint")}
                              </Badge>
                            ) : null}
                            {overdue ? (
                              <Badge variant="destructive">{t("assignment.overdue")}</Badge>
                            ) : null}
                          </div>
                          {task.description ? (
                            <p className="text-muted-foreground">{task.description}</p>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {[
                              t("assignment.due", { date: date(task.due_date) }),
                              task.owner_label
                                ? t("assignment.owner", { owner: task.owner_label })
                                : null,
                              task.materials
                                ? t("assignment.materials", { materials: task.materials })
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {task.completed_at ? (
                            <p className="text-xs text-emerald-700">
                              {t("assignment.completedBy", {
                                person: task.completedByName ?? t("assignment.unknownPerson"),
                                date: when(task.completed_at),
                              })}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}

        <ConfirmDelete
          label={t("assignment.delete.button")}
          title={t("assignment.delete.title")}
          description={t("assignment.delete.description")}
          confirm={t("assignment.delete.confirm")}
          cancel={t("assignment.delete.cancel")}
          action={deleteOnboardingAssignmentAction.bind(null, {
            orgId: org.id,
            assignmentId: assignment.id,
          })}
        />
      </div>
    </>
  );
}

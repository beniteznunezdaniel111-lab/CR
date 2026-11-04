import { CheckCircle2Icon, GraduationCapIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { todayIn } from "@/modules/onboarding/plan";
import { listMyAssignments } from "@/modules/trainings/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("myTrainings");
  return { title: t("title") };
}

export default async function MyTrainingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, user, country } = await requireOrgRole(slug, ALL_ROLES);
  const t = await getTranslations("myTrainings");
  const assignments = await listMyAssignments(org.id, user.id);
  const today = todayIn(org.timezone);
  const date = (value: string) =>
    formatDate(`${value}T12:00:00Z`, country, { dateStyle: "medium", timeZone: "UTC" });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {assignments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
              <GraduationCapIcon className="size-5" aria-hidden />
            </span>
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {assignments.map((assignment) => {
            const overdue = !assignment.passed && assignment.dueDate && assignment.dueDate < today;
            const started = assignment.modulesDone > 0 || assignment.attempts > 0;
            return (
              <li key={assignment.id}>
                <Card className="h-full" data-testid="my-training">
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <CardTitle className="text-base">{assignment.title}</CardTitle>
                      {assignment.passed ? (
                        <Badge>
                          <CheckCircle2Icon aria-hidden />
                          {t("passed")}
                        </Badge>
                      ) : overdue ? (
                        <Badge variant="destructive">{t("overdue")}</Badge>
                      ) : (
                        <Badge variant="outline">{t("pending")}</Badge>
                      )}
                    </div>
                    {assignment.description ? (
                      <CardDescription>{assignment.description}</CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="space-y-1 text-muted-foreground">
                      <p>
                        {t("progress", {
                          done: assignment.modulesDone,
                          total: assignment.moduleCount,
                        })}
                      </p>
                      {assignment.bestScore !== null ? (
                        <p>{t("best", { score: assignment.bestScore })}</p>
                      ) : null}
                      {assignment.dueDate ? (
                        <p>{t("due", { date: date(assignment.dueDate) })}</p>
                      ) : null}
                    </div>
                    <Button asChild size="sm" variant={assignment.passed ? "outline" : "default"}>
                      <Link href={orgPath(slug, `/my-trainings/${assignment.id}`)}>
                        {assignment.passed ? t("review") : started ? t("continue") : t("start")}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

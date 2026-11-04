import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { ALL_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { getMyAssignment } from "@/modules/trainings/queries";
import { TrainingPlayer } from "./training-player";

type Params = Promise<{ org: string; assignmentId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { org: slug, assignmentId } = await params;
  const { org, user } = await requireOrgRole(slug, ALL_ROLES);
  const assignment = await getMyAssignment(org.id, assignmentId, user.id);
  const t = await getTranslations("myTrainings");
  return { title: assignment?.training.title ?? t("title") };
}

export default async function MyTrainingPage({ params }: { params: Params }) {
  const { org: slug, assignmentId } = await params;
  const { org, user, country } = await requireOrgRole(slug, ALL_ROLES);
  const t = await getTranslations("myTrainings");
  const assignment = await getMyAssignment(org.id, assignmentId, user.id);
  if (!assignment) notFound();
  const when = (iso: string) =>
    formatDate(iso, country, { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone });

  return (
    <>
      <PageHeader
        title={assignment.training.title}
        description={assignment.training.description || undefined}
        actions={
          <Button asChild variant="outline">
            <Link href={orgPath(slug, "/my-trainings")}>
              <ArrowLeftIcon aria-hidden />
              {t("back")}
            </Link>
          </Button>
        }
      />
      <TrainingPlayer
        orgId={org.id}
        assignmentId={assignment.id}
        modules={assignment.modules}
        questions={assignment.questions.map((question) => ({
          id: question.id,
          question: question.question,
          options: question.options,
        }))}
        completedModules={assignment.completedModules}
        bestScore={assignment.bestScore}
        passed={assignment.passed}
        passScore={assignment.passScore}
        history={assignment.attemptHistory.map((attempt) => ({
          id: attempt.id,
          score: attempt.score,
          passed: attempt.passed,
          date: when(attempt.created_at),
        }))}
      />
    </>
  );
}

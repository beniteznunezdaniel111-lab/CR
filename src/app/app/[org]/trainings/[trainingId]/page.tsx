import { ArrowLeftIcon, FileTextIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { todayIn } from "@/modules/onboarding/plan";
import { listMemberOptions } from "@/modules/onboarding/queries";
import { getTrainingForHr } from "@/modules/trainings/queries";
import { AssignDialog, RemoveAssignmentButton } from "./assign-dialog";
import { AddModuleButton, ModuleCard } from "./module-card";
import { QuizEditor } from "./quiz-editor";
import { TrainingActions } from "./training-actions";
import { TrainingInfoForm } from "./training-info-form";

export const maxDuration = 120;

type Params = Promise<{ org: string; trainingId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { org: slug, trainingId } = await params;
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const training = await getTrainingForHr(org.id, trainingId);
  const t = await getTranslations("trainings");
  return { title: training?.title ?? t("title") };
}

export default async function TrainingPage({ params }: { params: Params }) {
  const { org: slug, trainingId } = await params;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("trainings");
  const training = await getTrainingForHr(org.id, trainingId);
  if (!training) notFound();
  const members = await listMemberOptions(org.id);
  const today = todayIn(org.timezone);
  const date = (value: string) =>
    formatDate(`${value}T12:00:00Z`, country, { dateStyle: "medium", timeZone: "UTC" });

  const published = training.status === "published";
  const hasContent = training.modules.some((module) => module.content.trim());
  const prompts = [
    ...new Set(
      (Array.isArray(training.generation) ? training.generation : [])
        .map((item) =>
          item && typeof item === "object" && !Array.isArray(item)
            ? `${String(item.prompt_id)}@${String(item.prompt_version)}`
            : null,
        )
        .filter(Boolean),
    ),
  ];

  const stateOf = (assignment: (typeof training.assignments)[number]) => {
    if (assignment.passedAt) return "passed" as const;
    if (assignment.dueDate && assignment.dueDate < today) return "overdue" as const;
    if (assignment.modulesDone > 0 || assignment.attempts > 0) return "inProgress" as const;
    return "pending" as const;
  };

  return (
    <>
      <PageHeader
        title={training.title}
        description={training.description || undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={orgPath(slug, "/trainings")}>
                <ArrowLeftIcon aria-hidden />
                {t("back")}
              </Link>
            </Button>
            <TrainingActions
              orgId={org.id}
              orgSlug={slug}
              trainingId={training.id}
              title={training.title}
              published={published}
              canDelete={!training.hasAttempts}
            />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={published ? "default" : "outline"}>{t(`status.${training.status}`)}</Badge>
        {!published ? <span>{t("editor.publishHint")}</span> : null}
        {training.sources.length ? (
          <span className="flex items-center gap-1">
            <FileTextIcon className="size-3.5" aria-hidden />
            {t("editor.sources", {
              sources: training.sources.map((source) => source.title).join(", "),
            })}
          </span>
        ) : null}
        {prompts.length ? (
          <span className="flex items-center gap-1">
            <SparklesIcon className="size-3.5" aria-hidden />
            {t("editor.generatedWith", { prompts: prompts.join(", ") })}
          </span>
        ) : null}
      </div>

      <Tabs defaultValue="content" className="space-y-4">
        <TabsList>
          <TabsTrigger value="content">{t("editor.tabs.content")}</TabsTrigger>
          <TabsTrigger value="quiz">{t("editor.tabs.quiz")}</TabsTrigger>
          <TabsTrigger value="assignments">{t("editor.tabs.assignments")}</TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              {training.modules.map((module) => (
                <ModuleCard
                  key={module.id}
                  orgId={org.id}
                  trainingId={training.id}
                  module={module}
                  canDelete={training.modules.length > 1}
                />
              ))}
              <AddModuleButton orgId={org.id} trainingId={training.id} />
            </div>
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>{t("editor.info")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TrainingInfoForm
                  orgId={org.id}
                  trainingId={training.id}
                  title={training.title}
                  description={training.description}
                  audience={training.audience ?? ""}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="quiz">
          <Card>
            <CardContent className="pt-6">
              <QuizEditor
                orgId={org.id}
                trainingId={training.id}
                locked={training.hasAttempts}
                hasContent={hasContent}
                questions={training.questions.map((question) => ({
                  question: question.question,
                  options: question.options,
                  correctIndex: question.correctIndex,
                  explanation: question.explanation,
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments">
          <Card>
            <CardContent className="space-y-4 pt-6">
              {published ? (
                <AssignDialog
                  orgId={org.id}
                  trainingId={training.id}
                  members={members}
                  today={today}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("editor.assignments.notPublished")}
                </p>
              )}
              {training.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("editor.assignments.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("editor.assignments.columns.person")}</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        {t("editor.assignments.columns.due")}
                      </TableHead>
                      <TableHead>{t("editor.assignments.columns.modules")}</TableHead>
                      <TableHead className="hidden md:table-cell">
                        {t("editor.assignments.columns.attempts")}
                      </TableHead>
                      <TableHead>{t("editor.assignments.columns.best")}</TableHead>
                      <TableHead>{t("editor.assignments.columns.status")}</TableHead>
                      <TableHead className="text-right">
                        {t("editor.assignments.columns.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {training.assignments.map((assignment) => {
                      const state = stateOf(assignment);
                      return (
                        <TableRow key={assignment.id} data-testid="training-assignment">
                          <TableCell className="font-medium">{assignment.name}</TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {assignment.dueDate
                              ? date(assignment.dueDate)
                              : t("editor.assignments.noDue")}
                          </TableCell>
                          <TableCell>
                            {assignment.modulesDone}/{assignment.moduleCount}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {assignment.attempts}
                          </TableCell>
                          <TableCell>
                            {assignment.bestScore === null ? "—" : `${assignment.bestScore} %`}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                state === "passed"
                                  ? "default"
                                  : state === "overdue"
                                    ? "destructive"
                                    : "outline"
                              }
                            >
                              {t(`editor.assignments.states.${state}`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {assignment.attempts === 0 ? (
                              <RemoveAssignmentButton
                                orgId={org.id}
                                trainingId={training.id}
                                assignmentId={assignment.id}
                                name={assignment.name}
                              />
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

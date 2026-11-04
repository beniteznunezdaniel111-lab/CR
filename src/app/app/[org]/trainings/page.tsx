import { GraduationCapIcon, PlusIcon } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { orgPath } from "@/lib/navigation";
import { todayIn } from "@/modules/onboarding/plan";
import { getProgressByPerson, listTrainings } from "@/modules/trainings/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("trainings");
  return { title: t("title") };
}

export default async function TrainingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("trainings");
  const tRoles = await getTranslations("roles");
  const [trainings, people] = await Promise.all([
    listTrainings(org.id),
    getProgressByPerson(org.id, todayIn(org.timezone)),
  ]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild>
            <Link href={orgPath(slug, "/trainings/new")}>
              <PlusIcon aria-hidden />
              {t("new")}
            </Link>
          </Button>
        }
      />
      <Tabs defaultValue="trainings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trainings">{t("tabs.trainings")}</TabsTrigger>
          <TabsTrigger value="people">{t("tabs.people")}</TabsTrigger>
        </TabsList>

        <TabsContent value="trainings">
          <Card>
            <CardContent className="pt-6">
              {trainings.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
                    <GraduationCapIcon className="size-5" aria-hidden />
                  </span>
                  <p className="max-w-md text-sm text-muted-foreground">{t("list.empty")}</p>
                  <Button asChild>
                    <Link href={orgPath(slug, "/trainings/new")}>
                      <PlusIcon aria-hidden />
                      {t("new")}
                    </Link>
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("list.columns.title")}</TableHead>
                      <TableHead>{t("list.columns.status")}</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">
                        {t("list.columns.modules")}
                      </TableHead>
                      <TableHead className="text-right">{t("list.columns.assigned")}</TableHead>
                      <TableHead className="text-right">{t("list.columns.passed")}</TableHead>
                      <TableHead className="hidden text-right md:table-cell">
                        {t("list.columns.average")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainings.map((training) => (
                      <TableRow key={training.id} data-testid="training-row">
                        <TableCell className="max-w-72 whitespace-normal">
                          <Link
                            href={orgPath(slug, `/trainings/${training.id}`)}
                            className="font-medium hover:underline"
                          >
                            {training.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={training.status === "published" ? "default" : "outline"}>
                            {t(`status.${training.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-right sm:table-cell">
                          {training.modules}
                        </TableCell>
                        <TableCell className="text-right">{training.assigned}</TableCell>
                        <TableCell className="text-right">{training.passed}</TableCell>
                        <TableCell className="hidden text-right md:table-cell">
                          {training.averageBest === null ? "—" : `${training.averageBest} %`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="people">
          <Card>
            <CardContent className="pt-6">
              {people.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("people.empty")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("people.columns.person")}</TableHead>
                      <TableHead className="text-right">{t("people.columns.assigned")}</TableHead>
                      <TableHead className="text-right">{t("people.columns.passed")}</TableHead>
                      <TableHead className="text-right">{t("people.columns.overdue")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {people.map((person) => (
                      <TableRow key={person.userId} data-testid="training-person">
                        <TableCell>
                          <p className="font-medium">{person.name}</p>
                          <p className="text-xs text-muted-foreground">{tRoles(person.role)}</p>
                        </TableCell>
                        <TableCell className="text-right">{person.assigned}</TableCell>
                        <TableCell className="text-right">{person.passed}</TableCell>
                        <TableCell className="text-right">
                          {person.overdue > 0 ? (
                            <Badge variant="destructive">{person.overdue}</Badge>
                          ) : (
                            0
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
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

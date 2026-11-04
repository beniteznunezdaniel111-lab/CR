import { BarChart3Icon, InboxIcon, SearchXIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
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
import { formatDate } from "@/lib/countries";
import { getQuestionClusters, listHrQueries } from "@/modules/faq/queries";
import { AnswerForm } from "./answer-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("hrQueries");
  return { title: t("title") };
}

export default async function HrQueriesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("hrQueries");
  const [queries, clusters] = await Promise.all([
    listHrQueries(org.id),
    getQuestionClusters(org.id),
  ]);
  const when = (iso: string) =>
    formatDate(iso, country, { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone });
  const open = queries.filter((query) => query.status === "open");
  const unanswered = clusters
    .filter((cluster) => cluster.unanswered > 0)
    .sort((a, b) => b.unanswered - a.unanswered);

  const clusterTable = (rows: typeof clusters, emptyText: string, showUnanswered: boolean) =>
    rows.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("insights.question")}</TableHead>
            <TableHead className="text-right">{t("insights.total")}</TableHead>
            {showUnanswered ? (
              <TableHead className="text-right">{t("insights.unanswered")}</TableHead>
            ) : null}
            <TableHead className="hidden sm:table-cell">{t("insights.last")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.question}-${index}`} data-testid="faq-cluster">
              <TableCell className="max-w-md whitespace-normal">{row.question}</TableCell>
              <TableCell className="text-right">{row.total}</TableCell>
              {showUnanswered ? (
                <TableCell className="text-right">{row.unanswered}</TableCell>
              ) : null}
              <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                {when(row.last_asked_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs defaultValue="queries" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queries">
            <InboxIcon aria-hidden />
            {t("tabs.queries")}
            {open.length > 0 ? <Badge className="ml-1">{open.length}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="frequent">
            <BarChart3Icon aria-hidden />
            {t("tabs.frequent")}
          </TabsTrigger>
          <TabsTrigger value="unanswered">
            <SearchXIcon aria-hidden />
            {t("tabs.unanswered")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queries" className="space-y-3">
          {queries.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t("queries.empty")}
              </CardContent>
            </Card>
          ) : (
            <>
              {open.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("queries.openCount", { count: open.length })}
                </p>
              ) : null}
              <ul className="space-y-3">
                {queries.map((query) => (
                  <li key={query.id}>
                    <Card data-testid="hr-query">
                      <CardContent className="space-y-3 pt-6">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              {t("queries.from", {
                                name: query.requesterName || t("queries.unknownPerson"),
                              })}{" "}
                              · {t("queries.sentAt", { date: when(query.created_at) })}
                            </p>
                            <p className="text-sm font-medium whitespace-pre-line">
                              {query.question}
                            </p>
                          </div>
                          <Badge variant={query.status === "answered" ? "default" : "outline"}>
                            {t(`queries.status.${query.status}`)}
                          </Badge>
                        </div>
                        {query.status === "answered" && query.answer ? (
                          <div className="rounded-md border-l-2 border-primary bg-muted/40 p-3 text-sm">
                            <p className="whitespace-pre-line">{query.answer}</p>
                            {query.answered_at ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {t("queries.answeredBy", {
                                  name: query.answeredByName || t("queries.unknownPerson"),
                                  date: when(query.answered_at),
                                })}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <AnswerForm orgId={org.id} queryId={query.id} />
                        )}
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          )}
        </TabsContent>

        <TabsContent value="frequent">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p role="note" className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t("insights.notice")}
              </p>
              {clusterTable(clusters, t("insights.empty"), true)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="unanswered">
          <Card>
            <CardContent className="space-y-3 pt-6">
              <p role="note" className="flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {t("insights.notice")} {t("insights.unansweredHint")}
              </p>
              {clusterTable(unanswered, t("insights.unansweredEmpty"), true)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

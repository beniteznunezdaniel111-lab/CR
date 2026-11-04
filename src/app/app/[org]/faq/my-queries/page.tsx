import { ArrowLeftIcon, InboxIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { AskHrDialog } from "@/components/faq/ask-hr-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ALL_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { listMyHrQueries } from "@/modules/faq/queries";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("faq.myQueries");
  return { title: t("title") };
}

export default async function MyQueriesPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, user, country } = await requireOrgRole(slug, ALL_ROLES);
  const t = await getTranslations("faq.myQueries");
  const queries = await listMyHrQueries(org.id, user.id);
  const when = (iso: string) =>
    formatDate(iso, country, { dateStyle: "medium", timeStyle: "short", timeZone: org.timezone });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={orgPath(slug, "/faq")}>
                <ArrowLeftIcon aria-hidden />
                {t("back")}
              </Link>
            </Button>
            <AskHrDialog orgId={org.id} variant="default" label={t("new")} />
          </>
        }
      />
      {queries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
              <InboxIcon className="size-5" aria-hidden />
            </span>
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {queries.map((query) => (
            <li key={query.id}>
              <Card data-testid="my-query">
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium whitespace-pre-line">{query.question}</p>
                    <Badge variant={query.status === "answered" ? "default" : "outline"}>
                      {t(`status.${query.status}`)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("sentAt", { date: when(query.created_at) })}
                  </p>
                  {query.answer ? (
                    <div className="rounded-md border-l-2 border-primary bg-muted/40 p-3 text-sm">
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        {t("answer")}
                        {query.answered_at
                          ? ` · ${t("answeredAt", { date: when(query.answered_at) })}`
                          : null}
                      </p>
                      <p className="whitespace-pre-line">{query.answer}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("waiting")}</p>
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

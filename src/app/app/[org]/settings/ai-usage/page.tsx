import { GaugeIcon, InfoIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate, formatNumber } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { getBudgetStatus, listUsage } from "@/modules/ai-usage/queries";
import {
  budgetLevel,
  lastMonths,
  monthKey,
  summarizeByFeature,
  summarizeByMonth,
} from "@/modules/ai-usage/summary";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aiUsage");
  return { title: t("title") };
}

const KNOWN_FEATURES = [
  "jobs",
  "candidates",
  "interviews",
  "onboarding",
  "faq",
  "trainings",
  "system",
];

export default async function AiUsagePage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, country } = await requireOrgRole(slug, ADMIN_ROLES);
  const t = await getTranslations("aiUsage");

  const now = new Date();
  const months = lastMonths(now, 6);
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const [budget, usage] = await Promise.all([getBudgetStatus(org.id), listUsage(org.id, since)]);
  const features = summarizeByFeature(usage.rows, monthKey(now));
  const byMonth = summarizeByMonth(usage.rows, months);

  const usd = (value: number, digits = 2) =>
    new Intl.NumberFormat(country.locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: Math.max(digits, 4),
    }).format(value);
  const number = (value: number) => formatNumber(value, country);
  const monthLabel = (key: string) =>
    formatDate(`${key}-15T12:00:00Z`, country, { month: "long", year: "numeric", timeZone: "UTC" });
  const featureName = (feature: string) =>
    t(
      `features.names.${KNOWN_FEATURES.includes(feature) ? feature : "other"}` as "features.names.other",
    );
  const level = budget ? budgetLevel(budget) : "ok";
  const percent = budget ? Math.min(100, Math.round(budget.ratio * 100)) : 0;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GaugeIcon className="size-5 text-primary" aria-hidden />
              {t("month.title")}
            </CardTitle>
            <CardDescription>{t("month.estimate")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {budget ? (
              <>
                <p className="text-2xl font-semibold" data-testid="ai-spent">
                  {t("month.spent", {
                    spent: usd(budget.spentUsd),
                    limit: usd(budget.limitUsd, 2),
                  })}
                </p>
                <div
                  role="progressbar"
                  aria-label={t("month.progressLabel")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  className="h-3 w-full overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className={cn(
                      "h-full rounded-full",
                      level === "exceeded"
                        ? "bg-destructive"
                        : level === "warning"
                          ? "bg-amber-500"
                          : "bg-primary",
                    )}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">{t("month.percent", { percent })}</p>
                <p
                  className={cn(
                    "flex items-start gap-2 rounded-md p-2 text-sm",
                    level === "exceeded"
                      ? "bg-destructive/10 text-destructive"
                      : level === "warning"
                        ? "bg-amber-50 text-amber-900"
                        : "bg-muted text-muted-foreground",
                  )}
                  role={level === "ok" ? undefined : "alert"}
                >
                  <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t(`month.${level}`)}
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("features.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {features.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("features.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("features.columns.feature")}</TableHead>
                      <TableHead className="text-right">{t("features.columns.calls")}</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">
                        {t("features.columns.errors")}
                      </TableHead>
                      <TableHead className="hidden text-right md:table-cell">
                        {t("features.columns.tokens")}
                      </TableHead>
                      <TableHead className="text-right">{t("features.columns.cost")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {features.map((row) => (
                      <TableRow key={row.feature} data-testid="ai-feature">
                        <TableCell>{featureName(row.feature)}</TableCell>
                        <TableCell className="text-right">{number(row.calls)}</TableCell>
                        <TableCell className="hidden text-right sm:table-cell">
                          {number(row.errors)}
                        </TableCell>
                        <TableCell className="hidden text-right md:table-cell">
                          {number(row.inputTokens)} / {number(row.outputTokens)}
                        </TableCell>
                        <TableCell className="text-right">{usd(row.costUsd)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("months.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("months.columns.month")}</TableHead>
                    <TableHead className="text-right">{t("months.columns.calls")}</TableHead>
                    <TableHead className="text-right">{t("months.columns.cost")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMonth.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="capitalize">{monthLabel(row.month)}</TableCell>
                      <TableCell className="text-right">{number(row.calls)}</TableCell>
                      <TableCell className="text-right">{usd(row.costUsd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("recent.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {usage.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("recent.empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("recent.columns.date")}</TableHead>
                    <TableHead>{t("recent.columns.feature")}</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      {t("recent.columns.prompt")}
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">
                      {t("recent.columns.model")}
                    </TableHead>
                    <TableHead className="hidden text-right md:table-cell">
                      {t("recent.columns.tokens")}
                    </TableHead>
                    <TableHead className="text-right">{t("recent.columns.cost")}</TableHead>
                    <TableHead>{t("recent.columns.status")}</TableHead>
                    <TableHead className="hidden md:table-cell">
                      {t("recent.columns.person")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usage.recent.map((row) => (
                    <TableRow key={row.id} data-testid="ai-call">
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDate(row.created_at, country, {
                          dateStyle: "short",
                          timeStyle: "short",
                          timeZone: org.timezone,
                        })}
                      </TableCell>
                      <TableCell>{featureName(row.feature)}</TableCell>
                      <TableCell className="hidden font-mono text-xs lg:table-cell">
                        {row.prompt_id ? `${row.prompt_id}@${row.prompt_version}` : "—"}
                      </TableCell>
                      <TableCell className="hidden text-xs lg:table-cell">{row.model}</TableCell>
                      <TableCell className="hidden text-right text-xs md:table-cell">
                        {number(
                          row.input_tokens +
                            row.cache_read_input_tokens +
                            row.cache_creation_input_tokens,
                        )}{" "}
                        / {number(row.output_tokens)}
                      </TableCell>
                      <TableCell className="text-right">{usd(row.cost_usd_est)}</TableCell>
                      <TableCell>
                        <Badge variant={row.status === "ok" ? "outline" : "destructive"}>
                          {t(
                            `recent.statuses.${
                              [
                                "ok",
                                "error",
                                "validation_failed",
                                "refused",
                                "budget_exceeded",
                              ].includes(row.status)
                                ? row.status
                                : "error"
                            }` as "recent.statuses.error",
                          )}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        {row.userName ?? t("recent.system")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

import {
  ArrowRightIcon,
  BellRingIcon,
  CheckCircle2Icon,
  CircleIcon,
  ClipboardListIcon,
  FilesIcon,
  GraduationCapIcon,
  InboxIcon,
  MessageCircleQuestionIcon,
  SearchXIcon,
  UsersIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NAV_ICONS } from "@/components/app-shell/nav-icons";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdminRole, isHrRole } from "@/lib/auth/roles";
import { formatDate } from "@/lib/countries";
import { getOrgContext } from "@/lib/auth/session";
import { CURRENT_PHASE, MAIN_NAV, navForRole, orgPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHrPending, getMyPending } from "@/modules/dashboard/queries";
import { todayIn } from "@/modules/onboarding/plan";

type PendingItem = { key: string; text: string; href: string; icon: ReactNode; tone?: "warn" };

function PendingList({ items }: { items: PendingItem[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            data-testid="dashboard-pending"
            className={`flex h-full items-center gap-3 rounded-lg border p-4 text-sm transition-colors hover:border-primary/40 ${
              item.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-950" : "bg-card"
            }`}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              {item.icon}
            </span>
            <span className="font-medium">{item.text}</span>
            <ArrowRightIcon className="ml-auto size-4 shrink-0" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function DashboardPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const context = await getOrgContext(slug);
  const t = await getTranslations();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", context.user.id)
    .maybeSingle();
  const firstName = profile?.full_name?.split(" ")[0];

  const modules = navForRole(MAIN_NAV, context.role).filter((item) => item.key !== "home");
  const isHr = isHrRole(context.role);
  const today = todayIn(context.org.timezone);
  const [hrPending, mine] = await Promise.all([
    isHr ? getHrPending(context.org.id, today) : Promise.resolve(null),
    getMyPending(context.org.id, context.user.id),
  ]);
  const icon = (Icon: typeof InboxIcon) => <Icon className="size-4" aria-hidden />;

  const hrItems: PendingItem[] = [];
  if (hrPending) {
    if (hrPending.candidates > 0)
      hrItems.push({
        key: "candidates",
        text: t("dashboard.pending.candidates", { count: hrPending.candidates }),
        href: orgPath(slug, "/candidates"),
        icon: icon(UsersIcon),
      });
    if (hrPending.hrQueries > 0)
      hrItems.push({
        key: "hrQueries",
        text: t("dashboard.pending.hrQueries", { count: hrPending.hrQueries }),
        href: orgPath(slug, "/hr-queries"),
        icon: icon(InboxIcon),
        tone: "warn",
      });
    if (hrPending.onboarding > 0)
      hrItems.push({
        key: "onboarding",
        text: t("dashboard.pending.onboarding", { count: hrPending.onboarding }),
        href: orgPath(slug, "/onboarding"),
        icon: icon(ClipboardListIcon),
        tone: "warn",
      });
    if (hrPending.trainings > 0)
      hrItems.push({
        key: "trainings",
        text: t("dashboard.pending.trainings", { count: hrPending.trainings }),
        href: orgPath(slug, "/trainings"),
        icon: icon(GraduationCapIcon),
        tone: "warn",
      });
    if (hrPending.faqUnanswered > 0)
      hrItems.push({
        key: "faqUnanswered",
        text: t("dashboard.pending.faqUnanswered", { count: hrPending.faqUnanswered }),
        href: orgPath(slug, "/hr-queries"),
        icon: icon(SearchXIcon),
      });
    if (hrPending.readyDocuments === 0)
      hrItems.push({
        key: "noDocuments",
        text: t("dashboard.pending.noDocuments"),
        href: orgPath(slug, "/faq/documents"),
        icon: icon(FilesIcon),
      });
  }

  const myItems: PendingItem[] = [];
  if (mine.trainings > 0)
    myItems.push({
      key: "myTrainings",
      text: `${t("dashboard.forYou.trainings", { count: mine.trainings })}${
        mine.nextDue
          ? ` ${t("dashboard.forYou.nextDue", {
              date: formatDate(`${mine.nextDue}T12:00:00Z`, context.country, {
                dateStyle: "medium",
                timeZone: "UTC",
              }),
            })}`
          : ""
      }`,
      href: orgPath(slug, "/my-trainings"),
      icon: icon(GraduationCapIcon),
    });
  if (mine.answeredQueries > 0)
    myItems.push({
      key: "answers",
      text: t("dashboard.forYou.answers", { count: mine.answeredQueries }),
      href: orgPath(slug, "/faq/my-queries"),
      icon: icon(BellRingIcon),
    });
  if (!isHr)
    myItems.push({
      key: "askFaq",
      text: t("dashboard.forYou.askFaq"),
      href: orgPath(slug, "/faq"),
      icon: icon(MessageCircleQuestionIcon),
    });

  let setupSteps: { key: string; done: boolean; href: string }[] = [];
  if (isAdminRole(context.role)) {
    const { count } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.org.id);
    const orgComplete = Boolean(
      context.org.legal_name && context.org.tax_id && context.org.privacy_email,
    );
    setupSteps = [
      { key: "createOrg", done: true, href: orgPath(slug) },
      { key: "completeOrg", done: orgComplete, href: orgPath(slug, "/settings/organization") },
      { key: "inviteTeam", done: (count ?? 0) > 1, href: orgPath(slug, "/settings/members") },
    ];
  }

  return (
    <>
      <PageHeader
        title={
          firstName ? t("dashboard.greeting", { name: firstName }) : t("dashboard.greetingNoName")
        }
        description={t("dashboard.subtitle", {
          organization: context.org.name,
          role: t(`roles.${context.role}`),
        })}
      />

      {setupSteps.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("dashboard.setup.title")}</CardTitle>
            <CardDescription>{t("dashboard.setup.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {setupSteps.map((step) => (
                <li key={step.key}>
                  <Link
                    href={step.href}
                    className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                  >
                    {step.done ? (
                      <CheckCircle2Icon className="size-5 text-emerald-600" aria-hidden />
                    ) : (
                      <CircleIcon className="size-5 text-muted-foreground" aria-hidden />
                    )}
                    <span className={step.done ? "text-muted-foreground line-through" : ""}>
                      {t(`dashboard.setup.steps.${step.key}`)}
                    </span>
                    <span className="sr-only">
                      {step.done ? t("dashboard.setup.done") : t("dashboard.setup.pending")}
                    </span>
                    {!step.done ? <ArrowRightIcon className="ml-auto size-4" aria-hidden /> : null}
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {isHr ? (
        <section aria-labelledby="pending-heading" className="mb-6 space-y-3">
          <h2 id="pending-heading" className="text-lg font-medium">
            {t("dashboard.pending.title")}
          </h2>
          {hrItems.length ? (
            <PendingList items={hrItems} />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2Icon className="size-4 text-emerald-600" aria-hidden />
              {t("dashboard.pending.allClear")}
            </p>
          )}
        </section>
      ) : null}

      {myItems.length ? (
        <section aria-labelledby="for-you-heading" className="mb-6 space-y-3">
          <h2 id="for-you-heading" className="text-lg font-medium">
            {t("dashboard.forYou.title")}
          </h2>
          <PendingList items={myItems} />
        </section>
      ) : null}

      <section aria-labelledby="modules-heading" className="space-y-3">
        <h2 id="modules-heading" className="text-lg font-medium">
          {t("dashboard.modules")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((item) => {
            const Icon = NAV_ICONS[item.key];
            const comingSoon = item.phase > CURRENT_PHASE;
            return (
              <li key={item.key}>
                <Link
                  href={orgPath(slug, item.path)}
                  className="flex h-full flex-col gap-2 rounded-xl border bg-card p-5 shadow-xs transition-colors hover:border-primary/40"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="size-5 text-primary" aria-hidden />
                    <span className="font-medium">{t(`nav.${item.key}`)}</span>
                    {comingSoon ? (
                      <Badge variant="secondary" className="ml-auto">
                        {t("nav.soon")}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(`dashboard.moduleDescriptions.${item.key}`)}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

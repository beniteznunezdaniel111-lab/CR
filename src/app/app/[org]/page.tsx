import { ArrowRightIcon, CheckCircle2Icon, CircleIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NAV_ICONS } from "@/components/app-shell/nav-icons";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAdminRole } from "@/lib/auth/roles";
import { getOrgContext } from "@/lib/auth/session";
import { CURRENT_PHASE, MAIN_NAV, navForRole, orgPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

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

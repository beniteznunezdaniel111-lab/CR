import { Building2Icon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMyMemberships, requireUser } from "@/lib/auth/session";

/** Entrada a la app: sin empresa → alta; con una → directo; con varias → elegir. */
export default async function AppIndexPage() {
  await requireUser("/app");
  const memberships = await getMyMemberships();
  if (memberships.length === 0) redirect("/app/new");
  if (memberships.length === 1) redirect(`/app/${memberships[0]!.organization.slug}`);

  const t = await getTranslations();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Logo href="/app" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("nav.chooseOrg")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {memberships.map((membership) => (
            <Link
              key={membership.membershipId}
              href={`/app/${membership.organization.slug}`}
              className="flex items-center gap-3 rounded-md border px-3 py-3 hover:bg-muted"
            >
              <Building2Icon className="size-4 text-muted-foreground" aria-hidden />
              <span className="flex-1 font-medium">{membership.organization.name}</span>
              <span className="text-xs text-muted-foreground">{t(`roles.${membership.role}`)}</span>
            </Link>
          ))}
          <Button asChild variant="outline" className="mt-2 w-full">
            <Link href="/app/new">
              <PlusIcon aria-hidden />
              {t("nav.newOrg")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

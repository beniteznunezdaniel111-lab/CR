import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { NewOrgForm } from "./new-org-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("newOrg");
  return { title: t("title") };
}

export default async function NewOrganizationPage() {
  await requireUser("/app/new");
  const t = await getTranslations("newOrg");
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Logo href="/app" />
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <NewOrgForm />
        </CardContent>
      </Card>
    </div>
  );
}

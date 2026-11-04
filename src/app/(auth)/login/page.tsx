import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/modules/auth/schemas";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; email?: string }>;
}) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const next = params.next ? safeNextPath(params.next) : undefined;
  const signupHref = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("login.title")}</CardTitle>
        <CardDescription>{t("login.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {params.error === "link" ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {t("login.linkError")}
          </p>
        ) : null}
        <LoginForm next={next} defaultEmail={params.email} />
        <p className="text-center text-sm text-muted-foreground">
          {t("login.noAccount")}{" "}
          <Link href={signupHref} className="font-medium text-primary hover:underline">
            {t("login.signupLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

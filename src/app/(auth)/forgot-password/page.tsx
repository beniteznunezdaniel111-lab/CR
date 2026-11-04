import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("forgot.title")}</CardTitle>
        <CardDescription>{t("forgot.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ForgotPasswordForm />
        <p className="text-center text-sm">
          <Link href="/login" className="text-primary hover:underline">
            {t("backToLogin")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

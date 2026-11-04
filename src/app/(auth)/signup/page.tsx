import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAccessCodeRequired } from "@/modules/auth/access-code";
import { getInvitationPreview } from "@/modules/members/invitation-preview";
import { SignupForm } from "./signup-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signup");
  return { title: t("title") };
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const t = await getTranslations("auth");
  const { invite: inviteToken } = await searchParams;
  const preview = inviteToken ? await getInvitationPreview(inviteToken) : null;
  const invite =
    inviteToken && preview?.status === "pending"
      ? { token: inviteToken, email: preview.email }
      : undefined;
  const loginHref = invite
    ? `/login?next=${encodeURIComponent(`/invite/${invite.token}`)}`
    : "/login";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("signup.title")}</CardTitle>
        <CardDescription>
          {invite && preview
            ? t("signup.inviteFor", { organization: preview.organizationName })
            : t("signup.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <SignupForm requireAccessCode={isAccessCodeRequired()} invite={invite} />
        <p className="text-center text-sm text-muted-foreground">
          {t("signup.haveAccount")}{" "}
          <Link href={loginHref} className="font-medium text-primary hover:underline">
            {t("signup.loginLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "@/modules/auth/actions";
import { getInvitationPreview } from "@/modules/members/invitation-preview";
import { AcceptInvitationForm } from "./accept-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("invite");
  return { title: t("title") };
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations();
  const [preview, user] = await Promise.all([getInvitationPreview(token), getCurrentUser()]);
  const invitePath = `/invite/${token}`;

  let content: React.ReactNode;
  if (!preview || preview.status !== "pending") {
    content = (
      <>
        <CardHeader>
          <CardTitle>{t("invite.unavailableTitle")}</CardTitle>
          <CardDescription>{t(`invite.status.${preview?.status ?? "invalid"}`)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href={user ? "/app" : "/login"}>{t("invite.goBack")}</Link>
          </Button>
        </CardContent>
      </>
    );
  } else {
    const header = (
      <CardHeader>
        <CardTitle>{t("invite.title")}</CardTitle>
        <CardDescription>
          {t("invite.summary", {
            organization: preview.organizationName,
            role: t(`roles.${preview.role}`),
          })}
        </CardDescription>
      </CardHeader>
    );

    if (!user) {
      content = (
        <>
          {header}
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t("invite.forEmail", { email: preview.email })}
            </p>
            <Button asChild className="w-full">
              <Link href={`/signup?invite=${encodeURIComponent(token)}`}>
                {t("invite.createAccount")}
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link
                href={`/login?next=${encodeURIComponent(invitePath)}&email=${encodeURIComponent(preview.email)}`}
              >
                {t("invite.haveAccount")}
              </Link>
            </Button>
          </CardContent>
        </>
      );
    } else if (user.email?.toLowerCase() !== preview.email.toLowerCase()) {
      content = (
        <>
          {header}
          <CardContent className="space-y-3">
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {t("invite.wrongAccount", { email: preview.email, current: user.email ?? "" })}
            </p>
            <form action={signOutAction}>
              <Button type="submit" variant="outline" className="w-full">
                {t("nav.signOut")}
              </Button>
            </form>
          </CardContent>
        </>
      );
    } else {
      content = (
        <>
          {header}
          <CardContent>
            <AcceptInvitationForm token={token} />
          </CardContent>
        </>
      );
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-10">
      <Logo />
      <Card className="w-full max-w-md">{content}</Card>
    </div>
  );
}

import {
  BookOpenCheckIcon,
  FileSearchIcon,
  FileTextIcon,
  MessagesSquareIcon,
  UsersRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config/brand";
import { getCurrentUser } from "@/lib/auth/session";

const MODULES = [
  { key: "jobs", icon: FileTextIcon },
  { key: "cvs", icon: FileSearchIcon },
  { key: "interviews", icon: UsersRoundIcon },
  { key: "faq", icon: MessagesSquareIcon },
  { key: "training", icon: BookOpenCheckIcon },
] as const;

export default async function LandingPage() {
  const t = await getTranslations("landing");
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Button asChild>
              <Link href="/app">{t("goToApp")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost">
                <Link href="/login">{t("login")}</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">{t("signup")}</Link>
              </Button>
            </>
          )}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-4 py-12 sm:px-6 sm:py-20">
        <section className="max-w-3xl space-y-6">
          <p className="text-sm font-medium text-primary">{t("eyebrow")}</p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            {t("title")}
          </h1>
          <p className="text-lg text-pretty text-muted-foreground">
            {t("subtitle", { app: APP_NAME })}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={user ? "/app" : "/signup"}>{user ? t("goToApp") : t("cta")}</Link>
            </Button>
          </div>
        </section>

        <section aria-labelledby="modules-title" className="space-y-6">
          <h2 id="modules-title" className="text-2xl font-semibold tracking-tight">
            {t("modulesTitle")}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map(({ key, icon: Icon }) => (
              <li key={key} className="rounded-xl border bg-card p-5 shadow-xs">
                <Icon className="mb-3 size-5 text-primary" aria-hidden />
                <h3 className="font-medium">{t(`modules.${key}.title`)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(`modules.${key}.description`)}
                </p>
              </li>
            ))}
          </ul>
          <p className="max-w-3xl text-sm text-muted-foreground">{t("humanInTheLoop")}</p>
        </section>
      </main>

      <footer className="border-t text-muted-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm sm:px-6">
          <span>
            © {new Date().getFullYear()} {APP_NAME}
          </span>
          <nav className="flex gap-4">
            <Link className="hover:text-foreground" href="/legal/terms">
              {t("terms")}
            </Link>
            <Link className="hover:text-foreground" href="/legal/privacy">
              {t("privacy")}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

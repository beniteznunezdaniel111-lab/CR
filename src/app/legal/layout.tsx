import { TriangleAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type * as React from "react";
import { Logo } from "@/components/brand/logo";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("legal");
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
      <Logo />
      <div
        role="note"
        className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{t("pendingReview")}</p>
      </div>
      <article className="space-y-4 text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-medium">
        {children}
      </article>
    </div>
  );
}

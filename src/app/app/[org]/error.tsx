"use client";

import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Error inesperado dentro de una empresa: mensaje claro, reintento y salida. */
export default function OrgError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorPage");
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center gap-4 py-16 text-center"
    >
      <span className="grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <TriangleAlertIcon className="size-6" aria-hidden />
      </span>
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">
          {t("reference", { digest: error.digest })}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcwIcon aria-hidden />
          {t("retry")}
        </Button>
        <Button asChild variant="outline">
          <Link href="/app">{t("home")}</Link>
        </Button>
      </div>
    </div>
  );
}

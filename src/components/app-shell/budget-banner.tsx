import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { BudgetStatus } from "@/lib/ai";
import { cn } from "@/lib/utils";

/** Aviso para el admin cuando la empresa pasa del 80 % del tope mensual de IA. */
export async function BudgetBanner({
  status,
  href,
}: {
  status: BudgetStatus | null;
  href: string;
}) {
  if (!status || (!status.warning && !status.exceeded)) return null;
  const t = await getTranslations("budgetBanner");
  const percent = Math.min(100, Math.round(status.ratio * 100));
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm sm:px-6",
        status.exceeded ? "bg-destructive/10 text-destructive" : "bg-amber-50 text-amber-900",
      )}
    >
      <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
      <span>{status.exceeded ? t("exceeded") : t("warning", { percent })}</span>
      <Link href={href} className="font-medium underline underline-offset-2">
        {t("link")}
      </Link>
    </div>
  );
}

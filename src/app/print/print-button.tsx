"use client";

import { PrinterIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  const t = useTranslations("print");
  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-md border bg-slate-50 p-3 text-sm print:hidden">
      <span className="text-muted-foreground">{t("help")}</span>
      <Button onClick={() => window.print()}>
        <PrinterIcon aria-hidden />
        {t("button")}
      </Button>
    </div>
  );
}

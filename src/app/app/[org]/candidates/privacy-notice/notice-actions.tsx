"use client";

import { CopyIcon, FileDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markdownToPlainText } from "@/lib/markdown";

export function NoticeActions({ markdown, filename }: { markdown: string; filename: string }) {
  const t = useTranslations("candidates.privacyNotice");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdownToPlainText(markdown));
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyError"));
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={copy}>
        <CopyIcon aria-hidden />
        {t("copy")}
      </Button>
      <Button variant="outline" onClick={download}>
        <FileDownIcon aria-hidden />
        {t("download")}
      </Button>
    </div>
  );
}

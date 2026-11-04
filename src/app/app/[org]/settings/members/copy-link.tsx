"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CopyLink({ link }: { link: string }) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={link}
        aria-label={t("invitationLink")}
        data-testid="invitation-link"
        onFocus={(event) => event.currentTarget.select()}
      />
      <Button type="button" variant="outline" onClick={copy}>
        {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  );
}

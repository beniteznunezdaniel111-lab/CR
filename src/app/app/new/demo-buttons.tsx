"use client";

import { FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormMessage } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { createDemoOrganizationAction } from "@/modules/demo/actions";

/** Botones para crear una empresa demo de España o de Costa Rica. */
export function DemoButtons() {
  const t = useTranslations("demo");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [country, setCountry] = useState<"ES" | "CR" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = (selected: "ES" | "CR") =>
    startTransition(async () => {
      setCountry(selected);
      setError(null);
      const result = await createDemoOrganizationAction({ country: selected });
      if (result.status === "success" && result.data) {
        if (result.data.partial) toast.warning(t("partial"));
        router.push(`/app/${result.data.slug}`);
      } else {
        setError((result.status === "error" && result.message) || t("errors.generic"));
        setCountry(null);
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(["ES", "CR"] as const).map((code) => (
          <Button key={code} variant="outline" disabled={pending} onClick={() => create(code)}>
            {pending && country === code ? (
              <Loader2Icon className="animate-spin" aria-hidden />
            ) : (
              <FlaskConicalIcon aria-hidden />
            )}
            {code === "ES" ? t("createES") : t("createCR")}
          </Button>
        ))}
      </div>
      {pending ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("creating")} {t("creatingHint")}
        </p>
      ) : null}
      {error ? <FormMessage status="error" message={error} /> : null}
    </div>
  );
}

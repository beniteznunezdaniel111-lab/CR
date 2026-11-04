"use client";

import { EyeIcon, EyeOffIcon, FileDownIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { FieldError } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getCvDownloadUrlAction,
  revealCandidateIdentityAction,
} from "@/modules/candidates/actions";
import { REVEAL_REASON_MAX } from "@/modules/candidates/constants";

export type IdentityData = {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: string[];
  filename: string | null;
};

export function IdentityPanel({
  orgId,
  candidateId,
  identity,
  anonymous,
  revealedAt,
  extracted,
}: {
  orgId: string;
  candidateId: string;
  /** null si la identidad está oculta por la revisión anónima. */
  identity: IdentityData | null;
  anonymous: boolean;
  /** Fecha formateada del revelado (modo anónimo). */
  revealedAt: string | null;
  extracted: boolean;
}) {
  const t = useTranslations("candidates.identity");
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<string[] | undefined>();
  const [pending, startTransition] = useTransition();
  const [opening, startOpening] = useTransition();

  const reveal = () =>
    startTransition(async () => {
      const result = await revealCandidateIdentityAction({ orgId, candidateId, reason });
      if (result.status === "error") {
        if (result.fieldErrors?.reason) {
          // Claves de "validation": FieldError las traduce.
          setErrors(result.fieldErrors.reason);
        } else {
          toast.error(result.message);
        }
        return;
      }
      toast.success(t("revealed"));
      setOpen(false);
      setReason("");
      router.refresh();
    });

  const openCv = () =>
    startOpening(async () => {
      // La ventana se abre con el clic (evita el bloqueo de ventanas emergentes).
      const tab = window.open("", "_blank");
      const result = await getCvDownloadUrlAction({ orgId, candidateId });
      if (result.status === "success" && result.data) {
        if (tab) {
          tab.opener = null;
          tab.location.href = result.data.url;
        } else {
          window.location.href = result.data.url;
        }
      } else {
        tab?.close();
        toast.error(result.status === "error" ? result.message : undefined);
      }
    });

  const rows: [string, string | null][] = identity
    ? [
        [t("name"), identity.name],
        [t("email"), identity.email],
        [t("phone"), identity.phone],
        [t("location"), identity.location],
        [t("links"), identity.links.join(" · ") || null],
        [t("file"), identity.filename],
      ]
    : [];

  return (
    <section aria-labelledby="identity-title" className="space-y-3">
      <div className="flex items-center gap-2">
        {identity ? (
          <EyeIcon className="size-4 text-primary" aria-hidden />
        ) : (
          <EyeOffIcon className="size-4 text-primary" aria-hidden />
        )}
        <h2 id="identity-title" className="font-medium">
          {t("title")}
        </h2>
      </div>

      {identity ? (
        <>
          {anonymous && revealedAt ? (
            <p className="text-xs text-muted-foreground">{t("revealedAt", { date: revealedAt })}</p>
          ) : null}
          {extracted ? null : <p className="text-xs text-muted-foreground">{t("notExtracted")}</p>}
          <dl className="space-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="break-words">{value ?? t("unknown")}</dd>
              </div>
            ))}
          </dl>
          <Button variant="outline" size="sm" onClick={openCv} disabled={opening}>
            {opening ? (
              <Loader2Icon className="animate-spin" aria-hidden />
            ) : (
              <FileDownIcon aria-hidden />
            )}
            {t("openCv")}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("hidden")}</p>
          <Dialog
            open={open}
            onOpenChange={(value) => {
              setOpen(value);
              setErrors(undefined);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <EyeIcon aria-hidden />
                {t("reveal")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("revealTitle")}</DialogTitle>
                <DialogDescription>{t("revealDescription")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor={reasonId}>{t("reason")}</Label>
                <Textarea
                  id={reasonId}
                  rows={3}
                  maxLength={REVEAL_REASON_MAX}
                  value={reason}
                  placeholder={t("reasonPlaceholder")}
                  aria-invalid={Boolean(errors)}
                  onChange={(event) => setReason(event.target.value)}
                />
                <FieldError messages={errors} />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{t("cancel")}</Button>
                </DialogClose>
                <Button onClick={reveal} disabled={pending} aria-busy={pending}>
                  {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
                  {t("confirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </section>
  );
}

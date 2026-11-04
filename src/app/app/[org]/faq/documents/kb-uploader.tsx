"use client";

import { Loader2Icon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { ControlledSelect } from "@/components/forms/controlled-select";
import { FormMessage } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isSupportedMime, mimeFromFilename } from "@/lib/extraction/mime";
import { createClient } from "@/lib/supabase/client";
import {
  deleteKbDocumentAction,
  prepareKbUploadAction,
  processKbDocumentAction,
} from "@/modules/faq/actions";
import {
  KB_BUCKET,
  KB_DOC_TYPES,
  KB_MAX_FILE_BYTES,
  type KbDocType,
} from "@/modules/faq/constants";

type Step = "idle" | "uploading" | "processing";

/**
 * Subida de un documento: el servidor registra el documento y firma la subida;
 * el navegador sube el fichero directo a Storage y después pide el procesado.
 */
export function KbUploader({ orgId }: { orgId: string }) {
  const t = useTranslations("faq.documents");
  const router = useRouter();
  const ids = { file: useId(), title: useId(), type: useId() };
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<KbDocType>("policy");
  const [step, setStep] = useState<Step>("idle");
  const [result, setResult] = useState<{ status: "error" | "success"; message: string } | null>(
    null,
  );
  const [inputKey, setInputKey] = useState(0);

  const pickFile = (picked: File | null) => {
    setResult(null);
    if (!picked) return setFile(null);
    const mime = isSupportedMime(picked.type) ? picked.type : mimeFromFilename(picked.name);
    if (!mime) {
      setResult({ status: "error", message: t("upload.wrongType") });
      return setFile(null);
    }
    if (picked.size > KB_MAX_FILE_BYTES) {
      setResult({ status: "error", message: t("upload.tooBig") });
      return setFile(null);
    }
    setFile(picked);
    if (!title.trim()) setTitle(picked.name.replace(/\.(pdf|docx)$/i, "").slice(0, 200));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || step !== "idle") return;
    setResult(null);
    setStep("uploading");
    try {
      const prepared = await prepareKbUploadAction({
        orgId,
        title: title.trim() || file.name,
        docType,
        file: { name: file.name, size: file.size, type: file.type },
      });
      if (prepared.status !== "success" || !prepared.data) {
        setResult({
          status: "error",
          message: (prepared.status === "error" && prepared.message) || t("errors.upload"),
        });
        return;
      }
      const contentType =
        (isSupportedMime(file.type) ? file.type : mimeFromFilename(file.name)) ?? undefined;
      const { error } = await createClient()
        .storage.from(KB_BUCKET)
        .uploadToSignedUrl(prepared.data.path, prepared.data.token, file, { contentType });
      if (error) {
        await deleteKbDocumentAction({ orgId, documentId: prepared.data.documentId });
        setResult({ status: "error", message: t("errors.upload") });
        return;
      }

      setStep("processing");
      const processed = await processKbDocumentAction({
        orgId,
        documentId: prepared.data.documentId,
      });
      if (processed.status === "success" && processed.data?.ready) {
        const message = t("upload.done", { chunks: processed.data.chunks });
        setResult({ status: "success", message });
        toast.success(message);
        setFile(null);
        setTitle("");
        setInputKey((key) => key + 1);
      } else {
        setResult({
          status: "error",
          message:
            processed.status === "success" && processed.data && !processed.data.ready
              ? processed.data.error
              : (processed.status === "error" && processed.message) || t("errors.generic"),
        });
      }
    } finally {
      setStep("idle");
      router.refresh();
    }
  };

  const busy = step !== "idle";
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor={ids.file}>{t("upload.file")}</Label>
        <Input
          key={inputKey}
          id={ids.file}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
        />
        <p className="text-xs text-muted-foreground">{t("upload.description")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={ids.title}>{t("upload.titleLabel")}</Label>
        <Input
          id={ids.title}
          value={title}
          maxLength={200}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("upload.titleHint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={ids.type}>{t("upload.type")}</Label>
        <ControlledSelect
          id={ids.type}
          name="docType"
          value={docType}
          onChange={(value) => value && setDocType(value as KbDocType)}
          options={KB_DOC_TYPES.map((value) => ({ value, label: t(`types.${value}`) }))}
        />
      </div>
      {result ? <FormMessage status={result.status} message={result.message} /> : null}
      <Button type="submit" disabled={!file || busy} aria-busy={busy}>
        {busy ? <Loader2Icon className="animate-spin" aria-hidden /> : <UploadIcon aria-hidden />}
        {step === "uploading"
          ? t("upload.uploading")
          : step === "processing"
            ? t("upload.processing")
            : t("upload.submit")}
      </Button>
    </form>
  );
}

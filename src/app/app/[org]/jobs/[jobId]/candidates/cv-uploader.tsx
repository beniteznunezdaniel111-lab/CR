"use client";

import {
  CheckCircle2Icon,
  CircleDashedIcon,
  FileTextIcon,
  Loader2Icon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isSupportedMime, mimeFromFilename } from "@/lib/extraction/mime";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  deleteCandidateAction,
  prepareCvUploadsAction,
  processCandidateAction,
} from "@/modules/candidates/actions";
import { CV_ACCEPT, MAX_FILE_BYTES, MAX_FILES_PER_UPLOAD } from "@/modules/candidates/constants";

type Step = "queued" | "uploading" | "analyzing" | "done" | "failed";
type Item = { key: string; file: File; step: Step; message?: string };

const STEP_ICONS: Record<Step, ReactNode> = {
  queued: <CircleDashedIcon className="size-4 text-muted-foreground" aria-hidden />,
  uploading: <Loader2Icon className="size-4 animate-spin" aria-hidden />,
  analyzing: <Loader2Icon className="size-4 animate-spin text-violet-600" aria-hidden />,
  done: <CheckCircle2Icon className="size-4 text-emerald-600" aria-hidden />,
  failed: <TriangleAlertIcon className="size-4 text-red-600" aria-hidden />,
};

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Subida de hasta 20 CVs: el servidor registra las candidaturas y da una URL
 * firmada por fichero; el navegador sube directo a Storage y después pide el
 * análisis de cada CV (uno a uno, con progreso).
 */
export function CvUploader({ orgId, jobId }: { orgId: string; jobId: string }) {
  const t = useTranslations("candidates.upload");
  const tErrors = useTranslations("candidates.errors");
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);

  const queued = items.filter((item) => item.step === "queued");
  const finished =
    items.length > 0 && items.every((item) => item.step === "done" || item.step === "failed");

  const update = (key: string, patch: Partial<Item>) =>
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const addFiles = (files: FileList | File[]) => {
    const found: string[] = [];
    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      const mime = isSupportedMime(file.type) ? file.type : mimeFromFilename(file.name);
      if (!mime) found.push(t("wrongType", { name: file.name }));
      else if (file.size > MAX_FILE_BYTES) found.push(t("tooBig", { name: file.name }));
      else accepted.push(file);
    }
    // Tras una tanda terminada, una selección nueva empieza una lista nueva.
    const base = finished ? [] : items;
    const next = [
      ...base,
      ...accepted.map((file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        file,
        step: "queued" as const,
      })),
    ];
    if (next.length > MAX_FILES_PER_UPLOAD) found.push(t("tooMany", { max: MAX_FILES_PER_UPLOAD }));
    setItems(next.slice(0, MAX_FILES_PER_UPLOAD));
    setProblems(found);
  };

  const start = async () => {
    const batch = items.filter((item) => item.step === "queued");
    if (batch.length === 0 || running) return;
    setRunning(true);
    setProblems([]);
    try {
      const prepared = await prepareCvUploadsAction({
        orgId,
        jobId,
        files: batch.map((item) => ({
          name: item.file.name,
          size: item.file.size,
          type: item.file.type,
        })),
      });
      if (prepared.status !== "success" || !prepared.data) {
        toast.error(prepared.status === "error" ? prepared.message : tErrors("upload"));
        return;
      }

      const supabase = createClient();
      // Uno a uno: el análisis de cada CV es una petición independiente.
      for (const [index, item] of batch.entries()) {
        const target = prepared.data[index]!;
        update(item.key, { step: "uploading" });
        const contentType =
          (isSupportedMime(item.file.type) ? item.file.type : mimeFromFilename(item.file.name)) ??
          undefined;
        const { error } = await supabase.storage
          .from("cvs")
          .uploadToSignedUrl(target.path, target.token, item.file, { contentType });
        if (error) {
          await deleteCandidateAction({
            orgId,
            candidateId: target.candidateId,
            reason: "upload_failed",
          });
          update(item.key, {
            step: "failed",
            message: tErrors("uploadFile", { name: item.file.name }),
          });
          continue;
        }

        update(item.key, { step: "analyzing" });
        const result = await processCandidateAction({ orgId, candidateId: target.candidateId });
        if (result.status === "success" && result.data?.processing === "done") {
          update(item.key, { step: "done" });
        } else {
          update(item.key, {
            step: "failed",
            message:
              result.status === "success" && result.data?.processing === "failed"
                ? result.data.message
                : result.status === "error"
                  ? result.message
                  : undefined,
          });
        }
      }
      toast.success(t("finished", { count: batch.length }));
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!running) addFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
        )}
      >
        <UploadIcon className="size-6 text-muted-foreground" aria-hidden />
        <p>
          {t("drop")}{" "}
          <label htmlFor={inputId} className="cursor-pointer font-medium text-primary underline">
            {t("choose")}
          </label>
        </p>
        <p className="text-xs text-muted-foreground">
          {t("description", { max: MAX_FILES_PER_UPLOAD })}
        </p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={CV_ACCEPT}
          aria-label={t("inputLabel")}
          className="sr-only"
          disabled={running}
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {problems.length > 0 ? (
        <ul role="alert" className="space-y-1 text-sm text-destructive">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}

      {items.length > 0 ? (
        <>
          <p className="text-xs text-muted-foreground">{t("selected", { count: items.length })}</p>
          <ul aria-label={t("progress")} className="divide-y rounded-md border">
            {items.map((item) => (
              <li key={item.key} className="flex items-start gap-3 px-3 py-2 text-sm">
                <FileTextIcon
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(item.file.size)}</p>
                  {item.message ? <p className="text-xs text-destructive">{item.message}</p> : null}
                </div>
                <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                  {STEP_ICONS[item.step]}
                  {t(`steps.${item.step}`)}
                </span>
                {item.step === "queued" && !running ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={t("remove", { name: item.file.name })}
                    onClick={() =>
                      setItems((current) => current.filter((entry) => entry.key !== item.key))
                    }
                  >
                    <XIcon aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={start} disabled={queued.length === 0 || running} aria-busy={running}>
          {running ? (
            <Loader2Icon className="animate-spin" aria-hidden />
          ) : (
            <UploadIcon aria-hidden />
          )}
          {t("submit")}
        </Button>
        {items.length > 0 && !running ? (
          <Button variant="ghost" onClick={() => setItems([])}>
            {t("clear")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

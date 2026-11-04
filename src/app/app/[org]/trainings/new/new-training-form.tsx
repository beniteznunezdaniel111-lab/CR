"use client";

import {
  CheckCircle2Icon,
  CircleDashedIcon,
  Loader2Icon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { ControlledSelect } from "@/components/forms/controlled-select";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isSupportedMime, mimeFromFilename } from "@/lib/extraction/mime";
import { createClient } from "@/lib/supabase/client";
import {
  createTrainingAction,
  generateModuleAction,
  generateOutlineAction,
  generateQuizAction,
} from "@/modules/trainings/actions";
import {
  MAX_UPLOAD_SOURCES,
  MODULE_COUNT,
  QUESTION_COUNT,
  TRAINING_BUCKET,
  TRAINING_MAX_FILE_BYTES,
} from "@/modules/trainings/constants";

type StepState = "pending" | "running" | "done" | "failed";
type Step = { key: string; label: string; state: StepState };

const STEP_ICONS: Record<StepState, ReactNode> = {
  pending: <CircleDashedIcon className="size-4 text-muted-foreground" aria-hidden />,
  running: <Loader2Icon className="size-4 animate-spin text-violet-600" aria-hidden />,
  done: <CheckCircle2Icon className="size-4 text-emerald-600" aria-hidden />,
  failed: <TriangleAlertIcon className="size-4 text-red-600" aria-hidden />,
};

const range = (min: number, max: number) =>
  Array.from({ length: max - min + 1 }, (_, index) => String(min + index));

/**
 * Formulario de nueva formación. La generación va por pasos (una petición por
 * paso, con progreso): borrador → subida → índice → cada módulo → test.
 */
export function NewTrainingForm({
  orgId,
  orgSlug,
  documents,
}: {
  orgId: string;
  orgSlug: string;
  documents: { id: string; title: string }[];
}) {
  const t = useTranslations("trainings");
  const router = useRouter();
  const ids = {
    title: useId(),
    topic: useId(),
    audience: useId(),
    files: useId(),
    modules: useId(),
    questions: useId(),
  };
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [moduleCount, setModuleCount] = useState(String(MODULE_COUNT.default));
  const [questionCount, setQuestionCount] = useState(String(QUESTION_COUNT.default));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>();
  const [message, setMessage] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [trainingId, setTrainingId] = useState<string | null>(null);

  const setStep = (key: string, state: StepState) =>
    setSteps((current) => current.map((step) => (step.key === key ? { ...step, state } : step)));

  const pickFiles = (list: FileList | null) => {
    setMessage(null);
    const picked = Array.from(list ?? []);
    const valid = picked.filter((file) => {
      const mime = isSupportedMime(file.type) ? file.type : mimeFromFilename(file.name);
      return mime && file.size <= TRAINING_MAX_FILE_BYTES;
    });
    if (valid.length !== picked.length) setMessage(t("errors.fileType", { name: "" }).trim());
    setFiles(valid.slice(0, MAX_UPLOAD_SOURCES));
  };

  const fail = (key: string, text: string) => {
    setStep(key, "failed");
    setMessage(text);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (running) return;
    setRunning(true);
    setMessage(null);
    setFieldErrors(undefined);
    setTrainingId(null);
    setSteps([
      { key: "create", label: t("create.steps.create"), state: "running" },
      ...(files.length
        ? [{ key: "upload", label: t("create.steps.upload"), state: "pending" as const }]
        : []),
      { key: "outline", label: t("create.steps.outline"), state: "pending" },
    ]);

    try {
      const created = await createTrainingAction({
        orgId,
        title: title || undefined,
        topic: topic || undefined,
        audience: audience || undefined,
        moduleCount: Number(moduleCount),
        questionCount: Number(questionCount),
        kbDocumentIds: selectedDocs,
        files: files.map((file) => ({ name: file.name, size: file.size, type: file.type })),
      });
      if (created.status !== "success" || !created.data) {
        setSteps([]);
        setFieldErrors(created.status === "error" ? created.fieldErrors : undefined);
        setMessage((created.status === "error" && created.message) || t("errors.generic"));
        return;
      }
      const id = created.data.trainingId;
      setTrainingId(id);
      setStep("create", "done");

      if (created.data.uploads.length) {
        setStep("upload", "running");
        const supabase = createClient();
        for (const [index, upload] of created.data.uploads.entries()) {
          const file = files[index]!;
          const contentType =
            (isSupportedMime(file.type) ? file.type : mimeFromFilename(file.name)) ?? undefined;
          const { error } = await supabase.storage
            .from(TRAINING_BUCKET)
            .uploadToSignedUrl(upload.path, upload.token, file, { contentType });
          if (error) return fail("upload", t("errors.upload"));
        }
        setStep("upload", "done");
      }

      setStep("outline", "running");
      const outline = await generateOutlineAction({
        orgId,
        trainingId: id,
        moduleCount: Number(moduleCount),
        keepTitle: Boolean(title.trim()),
      });
      if (outline.status !== "success" || !outline.data) {
        return fail(
          "outline",
          (outline.status === "error" && outline.message) || t("errors.generic"),
        );
      }
      setStep("outline", "done");
      const modules = outline.data.modules;
      setSteps((current) => [
        ...current,
        ...modules.map((module) => ({
          key: module.id,
          label: t("create.steps.module", { title: module.title }),
          state: "pending" as const,
        })),
        { key: "quiz", label: t("create.steps.quiz"), state: "pending" as const },
      ]);

      for (const item of modules) {
        setStep(item.id, "running");
        const result = await generateModuleAction({ orgId, trainingId: id, moduleId: item.id });
        if (result.status !== "success") {
          return fail(
            item.id,
            (result.status === "error" && result.message) || t("errors.generic"),
          );
        }
        setStep(item.id, "done");
      }

      setStep("quiz", "running");
      const quiz = await generateQuizAction({
        orgId,
        trainingId: id,
        questionCount: Number(questionCount),
      });
      if (quiz.status !== "success") {
        return fail("quiz", (quiz.status === "error" && quiz.message) || t("errors.generic"));
      }
      setStep("quiz", "done");
      router.push(`/app/${orgSlug}/trainings/${id}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor={ids.topic}>{t("create.topic")}</Label>
        <Textarea
          id={ids.topic}
          rows={3}
          value={topic}
          maxLength={2000}
          disabled={running}
          onChange={(event) => setTopic(event.target.value)}
          aria-invalid={Boolean(fieldErrors?.topic)}
        />
        <p className="text-xs text-muted-foreground">{t("create.topicHint")}</p>
        <FieldError messages={fieldErrors?.topic} />
      </div>

      <fieldset className="space-y-2" disabled={running}>
        <legend className="text-sm font-medium">{t("create.documents")}</legend>
        <p className="text-xs text-muted-foreground">{t("create.documentsHint")}</p>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("create.noDocuments")}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2">
                <Checkbox
                  id={`doc-${doc.id}`}
                  checked={selectedDocs.includes(doc.id)}
                  onCheckedChange={(checked) =>
                    setSelectedDocs((current) =>
                      checked === true
                        ? [...current, doc.id]
                        : current.filter((value) => value !== doc.id),
                    )
                  }
                />
                <Label htmlFor={`doc-${doc.id}`} className="font-normal">
                  {doc.title}
                </Label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor={ids.files}>{t("create.files")}</Label>
        <Input
          id={ids.files}
          type="file"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={running}
          onChange={(event) => pickFiles(event.target.files)}
        />
        <p className="text-xs text-muted-foreground">{t("create.filesHint")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={ids.title}>{t("create.titleLabel")}</Label>
          <Input
            id={ids.title}
            value={title}
            maxLength={200}
            disabled={running}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.audience}>{t("create.audience")}</Label>
          <Input
            id={ids.audience}
            value={audience}
            maxLength={300}
            disabled={running}
            onChange={(event) => setAudience(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("create.audienceHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.modules}>{t("create.moduleCount")}</Label>
          <ControlledSelect
            id={ids.modules}
            name="moduleCount"
            value={moduleCount}
            onChange={(value) => value && setModuleCount(value)}
            options={range(MODULE_COUNT.min, MODULE_COUNT.max).map((value) => ({
              value,
              label: value,
            }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={ids.questions}>{t("create.questionCount")}</Label>
          <ControlledSelect
            id={ids.questions}
            name="questionCount"
            value={questionCount}
            onChange={(value) => value && setQuestionCount(value)}
            options={range(QUESTION_COUNT.min, QUESTION_COUNT.max).map((value) => ({
              value,
              label: value,
            }))}
          />
        </div>
      </div>

      {steps.length > 0 ? (
        <ol aria-label={t("create.title")} className="space-y-1.5 rounded-md border p-3 text-sm">
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-2" data-state={step.state}>
              {STEP_ICONS[step.state]}
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}

      {message ? (
        <div className="space-y-2">
          <FormMessage status="error" message={message} />
          {trainingId ? (
            <p className="text-sm">
              {t("create.failed")}{" "}
              <Link
                href={`/app/${orgSlug}/trainings/${trainingId}`}
                className="font-medium text-primary underline"
              >
                {t("create.openEditor")}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={running} aria-busy={running}>
        {running ? (
          <Loader2Icon className="animate-spin" aria-hidden />
        ) : (
          <SparklesIcon aria-hidden />
        )}
        {t("create.submit")}
      </Button>
    </form>
  );
}

"use client";

import { Loader2Icon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { FieldError, FormMessage } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { MarkdownEditor } from "@/components/markdown/markdown-editor";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type FormState, idleState } from "@/lib/forms";
import {
  addModuleAction,
  deleteModuleAction,
  generateModuleAction,
  saveModuleAction,
} from "@/modules/trainings/actions";
import type { TrainingExample } from "@/modules/trainings/queries";

export type ModuleData = {
  id: string;
  position: number;
  title: string;
  objective: string;
  content: string;
  summary: string;
  examples: TrainingExample[];
};

/** Un módulo: lectura, edición (editor visual) y generación con IA. */
export function ModuleCard({
  orgId,
  trainingId,
  module,
  canDelete,
}: {
  orgId: string;
  trainingId: string;
  module: ModuleData;
  canDelete: boolean;
}) {
  const t = useTranslations("trainings.editor.module");
  const tTrainings = useTranslations("trainings");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, startTransition] = useTransition();

  const generate = () =>
    startTransition(async () => {
      const result = await generateModuleAction({ orgId, trainingId, moduleId: module.id });
      if (result.status === "error") toast.error(result.message ?? tTrainings("errors.generic"));
      router.refresh();
    });

  return (
    <Card data-testid="training-module">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {t("heading", { position: module.position })}
          </p>
          <CardTitle className="text-base">{module.title}</CardTitle>
          {module.objective ? (
            <p className="text-sm text-muted-foreground">{module.objective}</p>
          ) : null}
        </div>
        {!editing ? (
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={busy}>
              <PencilIcon aria-hidden />
              {t("edit")}
            </Button>
            <Button variant="ghost" size="sm" onClick={generate} disabled={busy}>
              {busy ? (
                <Loader2Icon className="animate-spin" aria-hidden />
              ) : (
                <SparklesIcon aria-hidden />
              )}
              {busy ? t("generating") : module.content ? t("regenerate") : t("generate")}
            </Button>
            {canDelete ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                aria-label={`${t("delete")}: ${module.title}`}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteModuleAction({
                      orgId,
                      trainingId,
                      moduleId: module.id,
                    });
                    if (result.status === "error")
                      toast.error(result.message ?? tTrainings("errors.generic"));
                    router.refresh();
                  })
                }
              >
                <Trash2Icon aria-hidden />
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {editing ? (
          <ModuleForm
            orgId={orgId}
            trainingId={trainingId}
            module={module}
            onDone={() => setEditing(false)}
          />
        ) : module.content ? (
          <div className="space-y-4">
            <MarkdownView markdown={module.content} />
            {module.examples.length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t("examples")}</p>
                <ul className="space-y-2">
                  {module.examples.map((example, index) => (
                    <li key={index} className="rounded-md border bg-muted/30 p-2 text-sm">
                      <p className="font-medium">{example.title}</p>
                      <p className="text-muted-foreground">{example.description}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {module.summary ? (
              <p className="rounded-md bg-accent p-2 text-sm text-accent-foreground">
                <span className="font-medium">{t("summaryLabel")}: </span>
                {module.summary}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ModuleForm({
  orgId,
  trainingId,
  module,
  onDone,
}: {
  orgId: string;
  trainingId: string;
  module: ModuleData;
  onDone: () => void;
}) {
  const t = useTranslations("trainings.editor.module");
  const [state, formAction] = useActionState(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      const result = await saveModuleAction(previous, formData);
      if (result.status === "success") {
        toast.success(result.message ?? "");
        onDone();
      }
      return result;
    },
    idleState,
  );
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const [content, setContent] = useState(module.content);
  const [examples, setExamples] = useState<TrainingExample[]>(module.examples);
  const ids = { title: useId(), objective: useId(), summary: useId() };

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="trainingId" value={trainingId} />
      <input type="hidden" name="moduleId" value={module.id} />
      <input type="hidden" name="content" value={content} />
      <input type="hidden" name="examples" value={JSON.stringify(examples)} />
      <div className="space-y-1">
        <Label htmlFor={ids.title}>{t("titleLabel")}</Label>
        <Input
          id={ids.title}
          name="title"
          defaultValue={module.title}
          aria-invalid={Boolean(fieldErrors?.title)}
        />
        <FieldError messages={fieldErrors?.title} />
      </div>
      <div className="space-y-1">
        <Label htmlFor={ids.objective}>{t("objectiveLabel")}</Label>
        <Input id={ids.objective} name="objective" defaultValue={module.objective} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{t("contentLabel")}</p>
        <MarkdownEditor
          markdown={module.content}
          onChange={setContent}
          ariaLabel={t("contentLabel")}
        />
        <FieldError messages={fieldErrors?.content} />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("examples")}</legend>
        {examples.map((example, index) => (
          <div key={index} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <Input
                aria-label={`${t("exampleTitle")} ${index + 1}`}
                value={example.title}
                onChange={(event) =>
                  setExamples((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, title: event.target.value } : item,
                    ),
                  )
                }
              />
              <Textarea
                aria-label={`${t("exampleDescription")} ${index + 1}`}
                rows={2}
                value={example.description}
                onChange={(event) =>
                  setExamples((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, description: event.target.value } : item,
                    ),
                  )
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={t("removeExample", { index: index + 1 })}
              onClick={() =>
                setExamples((current) => current.filter((_, position) => position !== index))
              }
            >
              <XIcon aria-hidden />
            </Button>
          </div>
        ))}
        {examples.length < 5 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExamples((current) => [...current, { title: "", description: "" }])}
          >
            <PlusIcon aria-hidden />
            {t("addExample")}
          </Button>
        ) : null}
        <FieldError
          messages={Object.entries(fieldErrors ?? {})
            .filter(([key]) => key.startsWith("examples"))
            .flatMap(([, messages]) => messages)}
        />
      </fieldset>
      <div className="space-y-1">
        <Label htmlFor={ids.summary}>{t("summaryLabel")}</Label>
        <Textarea id={ids.summary} name="summary" rows={3} defaultValue={module.summary} />
      </div>
      <FormMessage
        status={state.status}
        message={state.status === "error" ? state.message : undefined}
      />
      <div className="flex gap-2">
        <SubmitButton size="sm">{t("save")}</SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

export function AddModuleButton({ orgId, trainingId }: { orgId: string; trainingId: string }) {
  const t = useTranslations("trainings.editor.module");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await addModuleAction({ orgId, trainingId });
          router.refresh();
        })
      }
    >
      <PlusIcon aria-hidden />
      {t("add")}
    </Button>
  );
}

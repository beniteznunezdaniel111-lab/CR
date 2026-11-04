"use client";

import {
  CheckIcon,
  Loader2Icon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormMessage } from "@/components/forms/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { generateQuizAction, saveQuizAction } from "@/modules/trainings/actions";
import { QUESTION_COUNT, TRAINING_PASS_SCORE } from "@/modules/trainings/constants";

export type QuizQuestion = {
  question: string;
  options: string[];
  correctIndex: number | null;
  explanation: string;
};

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Test de la formación: vista con respuestas (solo RRHH), edición y generación. */
export function QuizEditor({
  orgId,
  trainingId,
  questions,
  locked,
  hasContent,
}: {
  orgId: string;
  trainingId: string;
  questions: QuizQuestion[];
  locked: boolean;
  hasContent: boolean;
}) {
  const t = useTranslations("trainings.editor.quiz");
  const tTrainings = useTranslations("trainings");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<QuizQuestion[]>(questions);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (index: number, patch: Partial<QuizQuestion>) =>
    setDraft((current) =>
      current.map((item, position) => (position === index ? { ...item, ...patch } : item)),
    );

  const generate = () =>
    startTransition(async () => {
      const result = await generateQuizAction({
        orgId,
        trainingId,
        questionCount: QUESTION_COUNT.default,
      });
      if (result.status === "error") toast.error(result.message ?? tTrainings("errors.generic"));
      router.refresh();
    });

  const save = () =>
    startTransition(async () => {
      setError(null);
      const result = await saveQuizAction({
        orgId,
        trainingId,
        questions: draft.map((item) => ({
          question: item.question,
          options: item.options,
          correctIndex: item.correctIndex ?? -1,
          explanation: item.explanation,
        })),
      });
      if (result.status === "success") {
        toast.success(result.message ?? tTrainings("quizSaved"));
        setEditing(false);
        router.refresh();
      } else {
        setError((result.status === "error" && result.message) || tTrainings("errors.generic"));
      }
    });

  if (editing) {
    return (
      <div className="space-y-4">
        {draft.map((item, index) => (
          <fieldset
            key={index}
            className="space-y-3 rounded-md border p-3"
            data-testid="quiz-edit-question"
          >
            <legend className="px-1 text-sm font-medium">
              {t("question", { index: index + 1 })}
            </legend>
            <Textarea
              aria-label={t("questionLabel", { index: index + 1 })}
              rows={2}
              value={item.question}
              onChange={(event) => update(index, { question: event.target.value })}
            />
            <div
              className="space-y-2"
              role="radiogroup"
              aria-label={t("question", { index: index + 1 })}
            >
              {item.options.map((option, optionIndex) => (
                <div key={optionIndex} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${index}`}
                    className="size-4 accent-primary"
                    checked={item.correctIndex === optionIndex}
                    aria-label={t("correctLabel", { letter: LETTERS[optionIndex]! })}
                    onChange={() => update(index, { correctIndex: optionIndex })}
                  />
                  <Input
                    aria-label={t("optionLabel", {
                      letter: LETTERS[optionIndex]!,
                      index: index + 1,
                    })}
                    value={option}
                    onChange={(event) =>
                      update(index, {
                        options: item.options.map((value, position) =>
                          position === optionIndex ? event.target.value : value,
                        ),
                      })
                    }
                  />
                  {item.options.length > 2 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("removeOption")}
                      onClick={() =>
                        update(index, {
                          options: item.options.filter((_, position) => position !== optionIndex),
                          correctIndex:
                            item.correctIndex === optionIndex
                              ? null
                              : item.correctIndex !== null && item.correctIndex > optionIndex
                                ? item.correctIndex - 1
                                : item.correctIndex,
                        })
                      }
                    >
                      <XIcon aria-hidden />
                    </Button>
                  ) : null}
                </div>
              ))}
              {item.options.length < 6 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => update(index, { options: [...item.options, ""] })}
                >
                  <PlusIcon aria-hidden />
                  {t("addOption")}
                </Button>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("explanation")}</Label>
              <Textarea
                aria-label={`${t("explanation")} ${index + 1}`}
                rows={2}
                value={item.explanation}
                onChange={(event) => update(index, { explanation: event.target.value })}
              />
            </div>
            {draft.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setDraft((current) => current.filter((_, position) => position !== index))
                }
              >
                <XIcon aria-hidden />
                {t("removeQuestion", { index: index + 1 })}
              </Button>
            ) : null}
          </fieldset>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setDraft((current) => [
              ...current,
              { question: "", options: ["", ""], correctIndex: null, explanation: "" },
            ])
          }
        >
          <PlusIcon aria-hidden />
          {t("addQuestion")}
        </Button>
        {error ? <FormMessage status="error" message={error} /> : null}
        <div className="flex gap-2">
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {t("save")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(questions);
              setEditing(false);
              setError(null);
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {locked ? (
        <p
          role="note"
          className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900"
        >
          <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("lockedHint")}
        </p>
      ) : null}
      {questions.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
          <Button onClick={generate} disabled={pending || !hasContent}>
            {pending ? (
              <Loader2Icon className="animate-spin" aria-hidden />
            ) : (
              <SparklesIcon aria-hidden />
            )}
            {pending ? t("generating") : t("generate")}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {t("count", { count: questions.length, score: TRAINING_PASS_SCORE })}
            </p>
            {!locked ? (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <PencilIcon aria-hidden />
                  {t("edit")}
                </Button>
                <Button variant="ghost" size="sm" onClick={generate} disabled={pending}>
                  {pending ? (
                    <Loader2Icon className="animate-spin" aria-hidden />
                  ) : (
                    <SparklesIcon aria-hidden />
                  )}
                  {pending ? t("generating") : t("generate")}
                </Button>
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t("secret")}</p>
          <ol className="space-y-3">
            {questions.map((item, index) => (
              <li key={index} className="rounded-md border p-3" data-testid="quiz-question">
                <p className="text-sm font-medium">
                  {index + 1}. {item.question}
                </p>
                <ul className="mt-2 space-y-1">
                  {item.options.map((option, optionIndex) => (
                    <li
                      key={optionIndex}
                      className={cn(
                        "flex items-center gap-2 rounded px-2 py-1 text-sm",
                        item.correctIndex === optionIndex &&
                          "bg-emerald-50 font-medium text-emerald-900",
                      )}
                    >
                      <span className="w-4 text-muted-foreground">{LETTERS[optionIndex]}</span>
                      {option}
                      {item.correctIndex === optionIndex ? (
                        <span className="ml-auto flex items-center gap-1 text-xs">
                          <CheckIcon className="size-3.5" aria-hidden />
                          {t("correct")}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {item.explanation ? (
                  <p className="mt-2 text-xs text-muted-foreground">{item.explanation}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

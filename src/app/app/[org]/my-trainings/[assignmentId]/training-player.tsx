"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleIcon,
  ClipboardCheckIcon,
  Loader2Icon,
  RotateCcwIcon,
  XCircleIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormMessage } from "@/components/forms/field-error";
import { MarkdownView } from "@/components/markdown/markdown-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  type AttemptResult,
  completeModuleAction,
  submitAttemptAction,
} from "@/modules/trainings/actions";
import type { TrainingExample } from "@/modules/trainings/queries";

type Module = {
  id: string;
  position: number;
  title: string;
  objective: string;
  content: string;
  summary: string;
  examples: TrainingExample[];
};
type Question = { id: string; question: string; options: string[] };
type View =
  | { kind: "overview" }
  | { kind: "module"; index: number }
  | { kind: "quiz" }
  | { kind: "result"; result: AttemptResult };

/** La formación desde el punto de vista de quien la hace: módulos y test. */
export function TrainingPlayer({
  orgId,
  assignmentId,
  modules,
  questions,
  completedModules,
  bestScore,
  passed,
  passScore,
  history,
}: {
  orgId: string;
  assignmentId: string;
  modules: Module[];
  questions: Question[];
  completedModules: string[];
  bestScore: number | null;
  passed: boolean;
  passScore: number;
  history: { id: string; score: number; passed: boolean; date: string }[];
}) {
  const t = useTranslations("myTrainings");
  const router = useRouter();
  const [view, setView] = useState<View>({ kind: "overview" });
  const [completed, setCompleted] = useState<string[]>(completedModules);
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const markCompleted = (moduleId: string) =>
    startTransition(async () => {
      const result = await completeModuleAction({ orgId, assignmentId, moduleId });
      if (result.status === "success") {
        setCompleted((current) => (current.includes(moduleId) ? current : [...current, moduleId]));
        router.refresh();
      } else {
        toast.error((result.status === "error" && result.message) || t("errors.generic"));
      }
    });

  const submit = () =>
    startTransition(async () => {
      setError(null);
      if (answers.some((answer) => answer === null)) {
        setError(t("errors.answerAll"));
        return;
      }
      const result = await submitAttemptAction({
        orgId,
        assignmentId,
        answers: answers as number[],
      });
      if (result.status === "success" && result.data) {
        setView({ kind: "result", result: result.data });
        router.refresh();
      } else {
        setError((result.status === "error" && result.message) || t("errors.generic"));
      }
    });

  const startQuiz = () => {
    setAnswers(questions.map(() => null));
    setError(null);
    setView({ kind: "quiz" });
  };

  if (view.kind === "module") {
    const current = modules[view.index]!;
    const done = completed.includes(current.id);
    return (
      <article className="space-y-4" aria-labelledby="module-title">
        <Button variant="ghost" size="sm" onClick={() => setView({ kind: "overview" })}>
          <ArrowLeftIcon aria-hidden />
          {t("modules")}
        </Button>
        <Card>
          <CardHeader>
            <p className="text-xs font-medium text-muted-foreground uppercase">
              {current.position}/{modules.length}
            </p>
            <CardTitle id="module-title" className="text-lg">
              {current.title}
            </CardTitle>
            {current.objective ? (
              <CardDescription>
                <span className="font-medium">{t("objective")}: </span>
                {current.objective}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-5">
            <MarkdownView markdown={current.content} />
            {current.examples.length ? (
              <section className="space-y-2" aria-label={t("examples")}>
                <h2 className="text-sm font-semibold">{t("examples")}</h2>
                <ul className="space-y-2">
                  {current.examples.map((example, index) => (
                    <li key={index} className="rounded-md border bg-muted/30 p-3 text-sm">
                      <p className="font-medium">{example.title}</p>
                      <p className="text-muted-foreground">{example.description}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {current.summary ? (
              <section className="rounded-md bg-accent p-3 text-sm text-accent-foreground">
                <h2 className="mb-1 font-semibold">{t("summary")}</h2>
                <p>{current.summary}</p>
              </section>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {done ? (
                <Badge>
                  <CheckCircle2Icon aria-hidden />
                  {t("completed")}
                </Badge>
              ) : (
                <Button onClick={() => markCompleted(current.id)} disabled={pending}>
                  {pending ? (
                    <Loader2Icon className="animate-spin" aria-hidden />
                  ) : (
                    <CheckCircle2Icon aria-hidden />
                  )}
                  {t("markCompleted")}
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                {view.index > 0 ? (
                  <Button
                    variant="outline"
                    onClick={() => setView({ kind: "module", index: view.index - 1 })}
                  >
                    <ArrowLeftIcon aria-hidden />
                    {t("previous")}
                  </Button>
                ) : null}
                {view.index < modules.length - 1 ? (
                  <Button
                    variant="outline"
                    onClick={() => setView({ kind: "module", index: view.index + 1 })}
                  >
                    {t("next")}
                    <ArrowRightIcon aria-hidden />
                  </Button>
                ) : questions.length ? (
                  <Button variant="outline" onClick={startQuiz}>
                    <ClipboardCheckIcon aria-hidden />
                    {t("quiz.start")}
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </article>
    );
  }

  if (view.kind === "quiz") {
    const answered = answers.filter((answer) => answer !== null).length;
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setView({ kind: "overview" })}>
          <ArrowLeftIcon aria-hidden />
          {t("modules")}
        </Button>
        <ol className="space-y-4">
          {questions.map((question, index) => (
            <li key={question.id}>
              <Card>
                <CardContent className="pt-6">
                  <fieldset className="space-y-3">
                    <legend className="space-y-1">
                      <span className="block text-xs text-muted-foreground">
                        {t("quiz.question", { index: index + 1, total: questions.length })}
                      </span>
                      <span className="block font-medium">{question.question}</span>
                    </legend>
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => {
                        const id = `q-${question.id}-${optionIndex}`;
                        return (
                          <label
                            key={optionIndex}
                            htmlFor={id}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm hover:bg-accent",
                              answers[index] === optionIndex && "border-primary bg-primary/5",
                            )}
                          >
                            <input
                              id={id}
                              type="radio"
                              name={`question-${question.id}`}
                              className="size-4 accent-primary"
                              checked={answers[index] === optionIndex}
                              onChange={() =>
                                setAnswers((current) =>
                                  current.map((value, position) =>
                                    position === index ? optionIndex : value,
                                  ),
                                )
                              }
                            />
                            {option}
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
        {error ? <FormMessage status="error" message={error} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={pending || answered < questions.length}>
            {pending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            {pending ? t("quiz.submitting") : t("quiz.submit")}
          </Button>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {t("quiz.answered", { answered, total: questions.length })}
          </span>
        </div>
      </div>
    );
  }

  if (view.kind === "result") {
    const { result } = view;
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-2 pt-6" role="status">
            <p className="flex items-center gap-2 text-lg font-semibold">
              {result.passed ? (
                <CheckCircle2Icon className="size-5 text-emerald-600" aria-hidden />
              ) : (
                <XCircleIcon className="size-5 text-red-600" aria-hidden />
              )}
              {result.passed
                ? t("quiz.passed")
                : t("quiz.result", {
                    score: result.score,
                    correct: result.correct,
                    total: result.total,
                  })}
            </p>
            {result.passed ? (
              <p className="text-sm">
                {t("quiz.result", {
                  score: result.score,
                  correct: result.correct,
                  total: result.total,
                })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("quiz.failed")}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {t("best", { score: result.bestScore })}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={startQuiz} variant={result.passed ? "outline" : "default"}>
                <RotateCcwIcon aria-hidden />
                {t("quiz.retry")}
              </Button>
              <Button variant="ghost" onClick={() => setView({ kind: "overview" })}>
                {t("modules")}
              </Button>
            </div>
          </CardContent>
        </Card>
        <ol className="space-y-3">
          {questions.map((question, index) => {
            const item = result.results[index];
            if (!item) return null;
            return (
              <li
                key={question.id}
                className="rounded-md border p-3 text-sm"
                data-testid="attempt-result"
              >
                <p className="flex items-start justify-between gap-2 font-medium">
                  <span>
                    {index + 1}. {question.question}
                  </span>
                  <Badge variant={item.correct ? "default" : "destructive"}>
                    {item.correct ? t("quiz.correct") : t("quiz.incorrect")}
                  </Badge>
                </p>
                {!item.correct ? (
                  <p className="mt-1 text-muted-foreground">
                    {t("quiz.rightAnswer", { answer: question.options[item.correctIndex] ?? "" })}
                  </p>
                ) : null}
                {item.explanation ? <p className="mt-1">{item.explanation}</p> : null}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // Resumen: módulos, test e historial de intentos.
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t("modules")}</CardTitle>
          <CardDescription>
            {t("progress", { done: completed.length, total: modules.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {modules.map((module, index) => {
              const done = completed.includes(module.id);
              return (
                <li key={module.id}>
                  <button
                    type="button"
                    onClick={() => setView({ kind: "module", index })}
                    className="flex w-full items-center gap-3 rounded-md border p-3 text-left text-sm hover:bg-accent"
                  >
                    {done ? (
                      <CheckCircle2Icon
                        className="size-4 shrink-0 text-emerald-600"
                        aria-label={t("completed")}
                      />
                    ) : (
                      <CircleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                    <span className="font-medium">
                      {module.position}. {module.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("quiz.title")}</CardTitle>
            <CardDescription>
              {questions.length
                ? t("quiz.description", { count: questions.length, score: passScore })
                : t("quiz.noQuiz")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {bestScore !== null ? (
              <p className="flex items-center gap-2 text-sm">
                {passed ? <Badge>{t("passed")}</Badge> : null}
                {t("best", { score: bestScore })}
              </p>
            ) : null}
            {questions.length ? (
              <Button onClick={startQuiz}>
                <ClipboardCheckIcon aria-hidden />
                {history.length ? t("quiz.retry") : t("quiz.start")}
              </Button>
            ) : null}
          </CardContent>
        </Card>
        {history.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("quiz.history")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {history.map((attempt) => (
                  <li key={attempt.id} className="flex items-center gap-2">
                    {attempt.passed ? (
                      <CheckCircle2Icon className="size-3.5 text-emerald-600" aria-hidden />
                    ) : (
                      <XCircleIcon className="size-3.5 text-muted-foreground" aria-hidden />
                    )}
                    {t("quiz.historyRow", { date: attempt.date, score: attempt.score })}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

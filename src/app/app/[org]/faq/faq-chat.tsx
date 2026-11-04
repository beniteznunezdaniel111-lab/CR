"use client";

import {
  BotIcon,
  Loader2Icon,
  SearchXIcon,
  SendIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { AnswerView } from "@/components/faq/answer-view";
import { AskHrDialog } from "@/components/faq/ask-hr-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteConversationAction } from "@/modules/faq/actions";
import type { FaqSegment, FaqSource } from "@/modules/faq/answer";
import type { AskEvent, FaqMessageView } from "@/modules/faq/ask";
import { QUESTION_MAX } from "@/modules/faq/constants";

type Streaming = { segments: FaqSegment[]; sources: FaqSource[] };

function withSegment(state: Streaming, block: number, change: (segment: FaqSegment) => FaqSegment) {
  const segments = [...state.segments];
  while (segments.length <= block) segments.push({ text: "", refs: [] });
  segments[block] = change(segments[block]!);
  return { ...state, segments };
}

/** Chat de la FAQ: respuestas en streaming con citas y salida a RRHH. */
export function FaqChat({
  orgId,
  orgSlug,
  conversationId: initialConversationId,
  initialMessages,
}: {
  orgId: string;
  orgSlug: string;
  conversationId: string | null;
  initialMessages: FaqMessageView[];
}) {
  const t = useTranslations("faq.chat");
  const router = useRouter();
  const inputId = useId();
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [localQuestion, setLocalQuestion] = useState<string | null>(null);
  const [streaming, setStreaming] = useState<Streaming | null>(null);
  const [failure, setFailure] = useState<{ question: string; message: string } | null>(null);
  const [deleting, startDelete] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  // Al abrir otra conversación (o una nueva) se cargan sus mensajes. Cuando la
  // URL cambia porque este chat acaba de crear la conversación, no se reinicia:
  // así no se pierde lo que se esté escribiendo o recibiendo.
  const [shownId, setShownId] = useState(initialConversationId);
  if (initialConversationId !== shownId) {
    setShownId(initialConversationId);
    if (initialConversationId !== conversationId) {
      setConversationId(initialConversationId);
      setMessages(initialMessages);
      setFailure(null);
    }
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streaming, localQuestion, failure]);

  const documentHref = (documentId: string) => `/app/${orgSlug}/faq/documents/${documentId}/file`;

  const handle = (event: AskEvent, asked: string) => {
    switch (event.type) {
      case "start":
        setConversationId(event.conversationId);
        setLocalQuestion(null);
        setMessages((current) => [...current, event.question]);
        window.history.replaceState(null, "", `?c=${event.conversationId}`);
        break;
      case "text":
        setStreaming((current) =>
          withSegment(current ?? { segments: [], sources: [] }, event.block, (segment) => ({
            ...segment,
            text: segment.text + event.text,
          })),
        );
        break;
      case "source":
        setStreaming((current) => {
          const base = current ?? { segments: [], sources: [] };
          return { ...base, sources: [...base.sources, event.source] };
        });
        break;
      case "ref":
        setStreaming((current) =>
          withSegment(current ?? { segments: [], sources: [] }, event.block, (segment) => ({
            ...segment,
            refs: segment.refs.includes(event.n) ? segment.refs : [...segment.refs, event.n],
          })),
        );
        break;
      case "final":
        setStreaming(null);
        setMessages((current) => [...current, event.message]);
        break;
      case "error":
        setStreaming(null);
        setFailure({ question: asked, message: event.message });
        break;
    }
  };

  const ask = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = question.trim();
    if (text.length < 2 || busy) return;
    setQuestion("");
    setFailure(null);
    setBusy(true);
    setLocalQuestion(text);
    setStreaming({ segments: [], sources: [] });
    try {
      const response = await fetch("/api/faq/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId, conversationId, question: text }),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? t("errors.generic"));
      }
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (line) handle(JSON.parse(line) as AskEvent, text);
          newline = buffer.indexOf("\n");
        }
      }
    } catch (error) {
      setFailure({
        question: text,
        message: error instanceof Error && error.message ? error.message : t("errors.network"),
      });
    } finally {
      setLocalQuestion(null);
      setStreaming(null);
      setBusy(false);
      router.refresh();
    }
  };

  const questionBefore = (index: number) =>
    messages
      .slice(0, index)
      .reverse()
      .find((message) => message.role === "user")?.content ?? "";

  return (
    <div className="flex min-h-[28rem] flex-col rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b p-3">
        <p role="note" className="flex max-w-2xl items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("privacyNotice")}
        </p>
        {conversationId ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={busy || deleting}>
                <Trash2Icon aria-hidden />
                {t("delete")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteConfirm.title")}</AlertDialogTitle>
                <AlertDialogDescription>{t("deleteConfirm.description")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("deleteConfirm.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    startDelete(async () => {
                      const result = await deleteConversationAction({ orgId, conversationId });
                      if (result.status === "error") {
                        toast.error(result.message ?? t("errors.generic"));
                        return;
                      }
                      router.push(`/app/${orgSlug}/faq`);
                      router.refresh();
                    })
                  }
                >
                  {t("deleteConfirm.confirm")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-label={t("conversations")}
        className="flex-1 space-y-4 overflow-y-auto p-4"
      >
        {messages.length === 0 && !localQuestion ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
              <SparklesIcon className="size-5" aria-hidden />
            </span>
            <h2 className="font-medium">{t("empty.title")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t("empty.description")}</p>
          </div>
        ) : null}

        {messages.map((message, index) =>
          message.role === "user" ? (
            <UserBubble key={message.id} text={message.content} label={t("you")} />
          ) : (
            <AssistantBubble key={message.id} label={t("assistant")}>
              {message.outcome === "answered" && message.segments ? (
                <>
                  <AnswerView
                    segments={message.segments}
                    sources={message.sources}
                    documentHref={documentHref}
                  />
                  <p className="mt-2 text-[0.7rem] text-muted-foreground">{t("aiNotice")}</p>
                </>
              ) : (
                <NoAnswer
                  orgId={orgId}
                  question={questionBefore(index)}
                  kind={message.outcome === "error" ? "error" : "notFound"}
                />
              )}
            </AssistantBubble>
          ),
        )}

        {localQuestion ? <UserBubble text={localQuestion} label={t("you")} /> : null}

        {streaming ? (
          <AssistantBubble label={t("assistant")} busy>
            {streaming.segments.some((segment) => segment.text) ? (
              <AnswerView
                segments={streaming.segments}
                sources={streaming.sources}
                documentHref={documentHref}
              />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                {t("thinking")}
              </p>
            )}
          </AssistantBubble>
        ) : null}

        {failure ? (
          <AssistantBubble label={t("assistant")}>
            <div role="alert" className="space-y-2 text-sm">
              <p className="flex items-start gap-2 text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {failure.message}
              </p>
              <AskHrDialog orgId={orgId} question={failure.question} label={t("askHr")} />
            </div>
          </AssistantBubble>
        ) : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={ask} className="space-y-2 border-t p-3">
        <Label htmlFor={inputId} className="sr-only">
          {t("questionLabel")}
        </Label>
        <div className="flex items-end gap-2">
          <Textarea
            id={inputId}
            value={question}
            maxLength={QUESTION_MAX}
            rows={2}
            placeholder={t("placeholder")}
            className="min-h-0 flex-1 resize-none"
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void ask();
              }
            }}
          />
          <Button type="submit" disabled={busy || question.trim().length < 2} aria-busy={busy}>
            {busy ? <Loader2Icon className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />}
            {t("send")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function UserBubble({ text, label }: { text: string; label: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm whitespace-pre-line text-primary-foreground"
        aria-label={label}
      >
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({
  label,
  busy,
  children,
}: {
  label: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2" data-answer aria-busy={busy || undefined}>
      <span
        className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"
        aria-hidden
      >
        <BotIcon className="size-4" />
      </span>
      <div
        className="max-w-[85%] min-w-0 flex-1 rounded-lg border bg-background px-3 py-2"
        aria-label={label}
      >
        {children}
      </div>
    </div>
  );
}

function NoAnswer({
  orgId,
  question,
  kind,
}: {
  orgId: string;
  question: string;
  kind: "notFound" | "error";
}) {
  const t = useTranslations("faq.chat");
  return (
    <div className="space-y-2 text-sm">
      <p className="flex items-start gap-2 font-medium">
        {kind === "error" ? (
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
        ) : (
          <SearchXIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        {kind === "error" ? t("error") : t("notFound")}
      </p>
      <p className="text-muted-foreground">{t("notFoundHint")}</p>
      <AskHrDialog orgId={orgId} question={question} label={t("askHr")} />
    </div>
  );
}

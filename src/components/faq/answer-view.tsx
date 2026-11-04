"use client";

import { FileTextIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment } from "react";
import type { FaqSegment, FaqSource } from "@/modules/faq/answer";

function pageLabel(
  t: ReturnType<typeof useTranslations<"faq.chat">>,
  source: Pick<FaqSource, "pageFrom" | "pageTo">,
) {
  if (source.pageFrom === null) return null;
  return source.pageTo !== null && source.pageTo !== source.pageFrom
    ? t("pages", { from: source.pageFrom, to: source.pageTo })
    : t("page", { page: source.pageFrom });
}

/**
 * Respuesta con sus citas: cada tramo lleva las referencias [n] a las fuentes,
 * y debajo se listan documento, página y el fragmento citado.
 */
export function AnswerView({
  segments,
  sources,
  documentHref,
}: {
  segments: FaqSegment[];
  sources: FaqSource[];
  /** Enlace al documento original (o null si no se puede abrir). */
  documentHref: (documentId: string) => string | null;
}) {
  const t = useTranslations("faq.chat");
  const byNumber = new Map(sources.map((source) => [source.n, source]));

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed whitespace-pre-line">
        {segments.map((segment, index) => (
          <Fragment key={index}>
            {segment.text}
            {segment.refs.map((n) =>
              byNumber.has(n) ? (
                <a
                  key={n}
                  href={`#source-${n}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.currentTarget
                      .closest("[data-answer]")
                      ?.querySelector(`[data-source="${n}"]`)
                      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
                  }}
                  className="ml-0.5 align-super text-[0.7rem] font-semibold text-primary no-underline hover:underline"
                  aria-label={t("source", { n })}
                >
                  [{n}]
                </a>
              ) : null,
            )}
          </Fragment>
        ))}
      </p>
      {sources.length > 0 ? (
        <div className="space-y-2" aria-label={t("sources")} role="group">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("sources")}
          </p>
          <ol className="space-y-2">
            {sources.map((source) => {
              const href = documentHref(source.documentId);
              const pages = pageLabel(t, source);
              return (
                <li
                  key={source.n}
                  data-source={source.n}
                  data-testid="faq-source"
                  className="rounded-md border bg-muted/30 p-2 text-xs"
                >
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                    <span className="text-primary">[{source.n}]</span>
                    <FileTextIcon className="size-3.5 text-muted-foreground" aria-hidden />
                    {href ? (
                      <a
                        href={href}
                        className="underline-offset-2 hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.documentTitle}
                      </a>
                    ) : (
                      <span>{source.documentTitle}</span>
                    )}
                    {source.heading ? (
                      <span className="font-normal text-muted-foreground">· {source.heading}</span>
                    ) : null}
                    {pages ? (
                      <span className="font-normal text-muted-foreground">· {pages}</span>
                    ) : null}
                  </p>
                  <blockquote className="mt-1 border-l-2 pl-2 text-muted-foreground italic">
                    {source.citedText}
                  </blockquote>
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

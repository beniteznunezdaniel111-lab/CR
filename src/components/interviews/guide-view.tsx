import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { GuideContent } from "@/modules/interviews/guide";

type Question = { question: string; lookFor: string[] };

/**
 * Contenido de una guía de entrevista. En modo impresión añade espacio para
 * notas y puntuación junto a cada pregunta.
 */
export function GuideView({
  content,
  printable = false,
}: {
  content: GuideContent;
  printable?: boolean;
}) {
  const t = useTranslations("interviews");
  let number = 0;

  const item = (entry: Question, extra?: string) => {
    number += 1;
    return (
      <li key={number} className="break-inside-avoid space-y-1.5" data-testid="guide-question">
        <p className="font-medium">
          {number}. {entry.question}
        </p>
        {extra ? <p className="text-xs text-muted-foreground">{extra}</p> : null}
        <div className="text-sm">
          <p className="text-xs font-medium text-muted-foreground">{t("lookFor")}</p>
          <ul className="list-disc pl-5">
            {entry.lookFor.map((signal, index) => (
              <li key={index}>{signal}</li>
            ))}
          </ul>
        </div>
        {printable ? (
          <div className="mt-2 grid grid-cols-[1fr_auto] gap-3 text-xs text-muted-foreground">
            <div className="h-16 rounded border border-dashed p-1">{t("notes")}</div>
            <div className="h-16 w-28 rounded border border-dashed p-1">{t("score")}</div>
          </div>
        ) : null}
      </li>
    );
  };

  const section = (id: string, title: string, children: ReactNode, help?: string) => (
    <section aria-labelledby={`guide-${id}`} className="space-y-3">
      <h2 id={`guide-${id}`} className="text-lg font-semibold">
        {title}
      </h2>
      {help ? <p className="text-sm text-muted-foreground">{help}</p> : null}
      {children}
    </section>
  );

  return (
    <div className={cn("space-y-8", printable && "text-[13px]")}>
      {content.intro
        ? section("intro", t("sections.intro"), <p className="text-sm">{content.intro}</p>)
        : null}

      {content.candidateFocus.length > 0
        ? section(
            "focus",
            t("sections.candidateFocus"),
            <ol className="space-y-4">{content.candidateFocus.map((entry) => item(entry))}</ol>,
          )
        : null}

      {content.competencies.length > 0
        ? section(
            "competencies",
            t("sections.competencies"),
            <div className="space-y-4">
              {content.competencies.map((group, index) => (
                <div key={index} className="space-y-2">
                  <h3 className="font-medium text-primary">{group.competency}</h3>
                  <ol className="space-y-4">{group.questions.map((entry) => item(entry))}</ol>
                </div>
              ))}
            </div>,
          )
        : null}

      {content.technical.length > 0
        ? section(
            "technical",
            t("sections.technical"),
            <ol className="space-y-4">{content.technical.map((entry) => item(entry))}</ol>,
          )
        : null}

      {content.behavioral.length > 0
        ? section(
            "behavioral",
            t("sections.behavioral"),
            <ol className="space-y-4">
              {content.behavioral.map((entry) => item(entry, entry.competency))}
            </ol>,
            t("starHelp"),
          )
        : null}

      {content.rubric.length > 0
        ? section(
            "rubric",
            t("sections.rubric"),
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="border p-2 text-left">{t("criterion")}</th>
                    {[1, 2, 3, 4, 5].map((level) => (
                      <th key={level} className="border p-2 text-left">
                        {t("level", { level })}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {content.rubric.map((row, index) => (
                    <tr key={index} className="break-inside-avoid align-top">
                      <th scope="row" className="border p-2 text-left font-medium">
                        {row.criterion}
                      </th>
                      {row.levels.map((level, position) => (
                        <td key={position} className="border p-2">
                          {level}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>,
          )
        : null}
    </div>
  );
}

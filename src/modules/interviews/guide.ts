/**
 * Salvaguardas de las guías de entrevista: se retiran las preguntas, señales o
 * criterios que mencionan atributos protegidos (o el salario anterior en España)
 * y se registra qué salvaguarda saltó, sin el texto. Los requirementId que no
 * son del puesto se descartan.
 */
import type { InterviewGuideOutput } from "@/lib/ai/prompts/interviews/guide.v1";
import type { CountryCode } from "@/lib/countries/types";
import {
  findProtectedMentions,
  removeProtectedSentences,
} from "@/lib/inclusive/protected-mentions";
import type { InclusiveCategory } from "@/lib/inclusive/types";

export type GuideContent = InterviewGuideOutput;
export type GuideSection =
  "intro" | "competencies" | "technical" | "behavioral" | "candidateFocus" | "rubric";
export type GuideFlag = { section: GuideSection; category: InclusiveCategory };

export const EMPTY_GUIDE: GuideContent = {
  intro: "",
  competencies: [],
  technical: [],
  behavioral: [],
  candidateFocus: [],
  rubric: [],
};

export function sanitizeGuide(
  output: InterviewGuideOutput,
  { country, requirementIds }: { country: CountryCode; requirementIds: readonly string[] },
): { content: GuideContent; guardFlags: GuideFlag[] } {
  const flags: GuideFlag[] = [];
  const validIds = new Set(requirementIds);
  /** true si el texto es aceptable; si no, registra la salvaguarda. */
  const clean = (section: GuideSection, ...texts: string[]) => {
    const mentions = texts.flatMap((text) => findProtectedMentions(text, country));
    for (const category of new Set(mentions.map((mention) => mention.category))) {
      flags.push({ section, category });
    }
    return mentions.length === 0;
  };
  const requirement = (id: string | null) => (id && validIds.has(id) ? id : null);

  const intro = removeProtectedSentences(output.intro, country);
  for (const category of intro.categories) flags.push({ section: "intro", category });

  return {
    content: {
      intro: intro.text,
      competencies: output.competencies
        .map((group) => ({
          competency: group.competency,
          questions: group.questions.filter((item) =>
            clean("competencies", group.competency, item.question, ...item.lookFor),
          ),
        }))
        .filter((group) => group.questions.length > 0),
      technical: output.technical
        .filter((item) => clean("technical", item.question, ...item.lookFor))
        .map((item) => ({ ...item, requirementId: requirement(item.requirementId) })),
      behavioral: output.behavioral.filter((item) =>
        clean("behavioral", item.question, item.competency, ...item.lookFor),
      ),
      candidateFocus: output.candidateFocus
        .filter((item) => clean("candidateFocus", item.question, ...item.lookFor))
        .map((item) => ({ ...item, requirementId: requirement(item.requirementId) })),
      rubric: output.rubric.filter((item) => clean("rubric", item.criterion, ...item.levels)),
    },
    guardFlags: flags,
  };
}

/** Número total de preguntas de una guía. */
export function countQuestions(content: GuideContent): number {
  return (
    content.competencies.reduce((sum, group) => sum + group.questions.length, 0) +
    content.technical.length +
    content.behavioral.length +
    content.candidateFocus.length
  );
}

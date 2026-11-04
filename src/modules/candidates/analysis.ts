/**
 * Convierte la salida de la IA (cv.analysis) en lo que se guarda y se muestra,
 * aplicando las salvaguardas del módulo:
 *   - solo cuentan los requisitos del puesto (ids desconocidos fuera; los que
 *     falten quedan como "no consta" y se marca que la IA no los evaluó);
 *   - cada cita se comprueba contra el texto del CV que vio la IA
 *     (evidence_verified); el recuento solo usa "cumple" con cita verificada;
 *   - las frases que mencionan atributos protegidos se retiran y se registra la
 *     salvaguarda (sin el texto);
 *   - se vuelve a ocultar cualquier dato identificativo que se colara.
 * No hay puntuación: el recuento es determinista y sirve para ordenar y filtrar.
 */
import type { CvAnalysisOutput } from "@/lib/ai/prompts/cv/analysis.v1";
import type { CountryCode } from "@/lib/countries/types";
import {
  findProtectedMentions,
  removeProtectedSentences,
} from "@/lib/inclusive/protected-mentions";
import { excerptAppearsIn } from "@/lib/inclusive/rules";
import type { InclusiveCategory } from "@/lib/inclusive/types";
import { type CandidateIdentity, redactIdentity } from "@/lib/privacy/redaction";
import type { RequirementKind } from "@/modules/jobs/constants";
import type { MatchResult } from "./constants";

export type RequirementRef = { id: string; text: string; kind: RequirementKind };

export type AnalysisMatch = {
  requirementId: string;
  requirementText: string;
  requirementKind: RequirementKind;
  sortOrder: number;
  result: MatchResult;
  evidence: string | null;
  evidenceVerified: boolean;
  explanation: string;
  /** La IA no devolvió resultado para este requisito. */
  notEvaluated: boolean;
};

export type GuardField = "summary" | "explanation" | "evidence" | "question" | "profile";
export type GuardFlag = { field: GuardField; category: InclusiveCategory };

export type InterviewQuestion = { question: string; purpose: string; requirementId: string | null };
export type CandidateProfile = CvAnalysisOutput["profile"];

export type AnalysisCounts = {
  requiredMet: number;
  requiredTotal: number;
  preferredMet: number;
  preferredTotal: number;
};

export type BuiltAnalysis = {
  summary: string;
  profile: CandidateProfile;
  questions: InterviewQuestion[];
  matches: AnalysisMatch[];
  counts: AnalysisCounts;
  guardFlags: GuardFlag[];
};

export const EMPTY_PROFILE: CandidateProfile = {
  headline: null,
  experience: [],
  education: [],
  skills: [],
  languages: [],
  certifications: [],
};

export function countMatches(
  matches: readonly Pick<AnalysisMatch, "requirementKind" | "result" | "evidenceVerified">[],
): AnalysisCounts {
  const total = (kind: RequirementKind) => matches.filter((m) => m.requirementKind === kind).length;
  const met = (kind: RequirementKind) =>
    matches.filter((m) => m.requirementKind === kind && m.result === "meets" && m.evidenceVerified)
      .length;
  return {
    requiredMet: met("required"),
    requiredTotal: total("required"),
    preferredMet: met("preferred"),
    preferredTotal: total("preferred"),
  };
}

export function buildAnalysis({
  output,
  requirements,
  redactedText,
  identity,
  country,
}: {
  output: CvAnalysisOutput;
  requirements: readonly RequirementRef[];
  redactedText: string;
  identity: CandidateIdentity;
  country: CountryCode;
}): BuiltAnalysis {
  const flags: GuardFlag[] = [];
  const flag = (field: GuardField, categories: Iterable<InclusiveCategory>) => {
    for (const category of new Set(categories)) flags.push({ field, category });
  };
  /** Texto libre: oculta identidad y retira frases con atributos protegidos. */
  const clean = (field: GuardField, text: string) => {
    const result = removeProtectedSentences(redactIdentity(text, identity), country);
    flag(field, result.categories);
    return result.text;
  };
  /** Valor corto (habilidad, cargo...): se descarta entero si menciona algo protegido. */
  const keep = (value: string | null): string | null => {
    if (!value?.trim()) return null;
    const redacted = redactIdentity(value.trim(), identity);
    const mentions = findProtectedMentions(redacted, country);
    if (mentions.length > 0) {
      flag(
        "profile",
        mentions.map((mention) => mention.category),
      );
      return null;
    }
    return redacted;
  };

  const byId = new Map<string, CvAnalysisOutput["requirements"][number]>();
  for (const item of output.requirements) {
    if (!byId.has(item.requirementId)) byId.set(item.requirementId, item);
  }

  const matches: AnalysisMatch[] = requirements.map((req, index) => {
    const ai = byId.get(req.id);
    const result: MatchResult = ai?.result ?? "not_found";
    let evidence = result === "not_found" ? null : ai?.evidence?.trim() || null;
    const evidenceVerified = evidence ? excerptAppearsIn(evidence, redactedText) : false;
    if (evidence) {
      const mentions = findProtectedMentions(evidence, country);
      if (mentions.length > 0) {
        flag(
          "evidence",
          mentions.map((mention) => mention.category),
        );
        evidence = null;
      } else {
        evidence = redactIdentity(evidence, identity);
      }
    }
    return {
      requirementId: req.id,
      requirementText: req.text,
      requirementKind: req.kind,
      sortOrder: index + 1,
      result,
      evidence,
      evidenceVerified,
      explanation: ai ? clean("explanation", ai.explanation) : "",
      notEvaluated: !ai,
    };
  });

  const validIds = new Set(requirements.map((req) => req.id));
  const questions: InterviewQuestion[] = [];
  for (const item of output.interviewQuestions) {
    const question = redactIdentity(item.question.trim(), identity);
    const purpose = redactIdentity(item.purpose.trim(), identity);
    const mentions = findProtectedMentions(`${question} ${purpose}`, country);
    if (mentions.length > 0) {
      flag(
        "question",
        mentions.map((mention) => mention.category),
      );
      continue;
    }
    questions.push({
      question,
      purpose,
      requirementId:
        item.requirementId && validIds.has(item.requirementId) ? item.requirementId : null,
    });
  }

  const source = output.profile;
  const profile: CandidateProfile = {
    headline: keep(source.headline),
    experience: source.experience.flatMap((item) => {
      const role = keep(item.role);
      if (!role) return [];
      return [
        {
          role,
          organization: keep(item.organization),
          period: keep(item.period),
          highlights: item.highlights.map(keep).filter((value): value is string => !!value),
        },
      ];
    }),
    education: source.education.flatMap((item) => {
      const title = keep(item.title);
      return title
        ? [{ title, institution: keep(item.institution), period: keep(item.period) }]
        : [];
    }),
    skills: source.skills.map(keep).filter((value): value is string => !!value),
    languages: source.languages.flatMap((item) => {
      const language = keep(item.language);
      return language ? [{ language, level: keep(item.level) }] : [];
    }),
    certifications: source.certifications.map(keep).filter((value): value is string => !!value),
  };

  return {
    summary: clean("summary", output.summary),
    profile,
    questions: questions.slice(0, 8),
    matches,
    counts: countMatches(matches),
    guardFlags: flags,
  };
}

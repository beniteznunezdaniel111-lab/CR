import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  FileSearchIcon,
  HistoryIcon,
  ListChecksIcon,
  MessageCircleQuestionIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/app-shell/page-header";
import { AiSuggestionNotice } from "@/components/candidates/ai-notice";
import { MatchResultBadge, ProcessingBadge } from "@/components/candidates/candidate-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HR_ROLES } from "@/lib/auth/roles";
import { requireOrgRole } from "@/lib/auth/session";
import { formatDate } from "@/lib/countries";
import { orgPath } from "@/lib/navigation";
import { getCandidateDetail } from "@/modules/candidates/queries";
import { getJob } from "@/modules/jobs/queries";
import { ProcessButton } from "../candidates-table";
import { DecisionPanel } from "./decision-panel";
import { DeleteCandidate } from "./delete-candidate";
import { IdentityPanel } from "./identity-panel";

export const maxDuration = 300;

type Params = Promise<{ org: string; jobId: string; candidateId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { org: slug, candidateId } = await params;
  const t = await getTranslations("candidates");
  const { org } = await requireOrgRole(slug, HR_ROLES);
  const detail = await getCandidateDetail(org.id, candidateId);
  if (!detail) return { title: t("title") };
  return {
    title:
      detail.pii?.full_name ?? t("candidateAlias", { number: detail.candidate.candidate_number }),
  };
}

export default async function CandidatePage({ params }: { params: Params }) {
  const { org: slug, jobId, candidateId } = await params;
  const { org, country } = await requireOrgRole(slug, HR_ROLES);
  const t = await getTranslations("candidates");

  const [job, detail] = await Promise.all([
    getJob(org.id, jobId),
    getCandidateDetail(org.id, candidateId),
  ]);
  if (!job || !detail || detail.candidate.job_id !== jobId) notFound();

  const { candidate, pii, analysis, events } = detail;
  const when = (iso: string, withTime = true) =>
    formatDate(iso, country, {
      dateStyle: "medium",
      ...(withTime ? { timeStyle: "short" } : {}),
      timeZone: org.timezone,
    });
  const person = (name: string | null) => name ?? t("detail.unknownPerson");
  const alias = t("candidateAlias", { number: candidate.candidate_number });
  const pipelineHref = orgPath(slug, `/jobs/${jobId}/candidates`);
  const failedMessage =
    candidate.processing_status === "failed" && candidate.processing_error
      ? t(`processingErrors.${candidate.processing_error}` as string)
      : null;
  const removedSummary = analysis?.guardFlags.some((flag) => flag.field === "summary") ?? false;

  return (
    <>
      <PageHeader
        title={pii?.full_name ?? alias}
        description={[
          job.title,
          t("detail.uploaded", { date: when(candidate.created_at, false) }),
          t("detail.retention", { date: when(candidate.retention_until, false) }),
        ].join(" · ")}
        actions={
          <Button asChild variant="outline">
            <Link href={pipelineHref}>
              <ArrowLeftIcon aria-hidden />
              {t("title")}
            </Link>
          </Button>
        }
      />

      <div className="space-y-6">
        <AiSuggestionNotice />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {!analysis || candidate.processing_status !== "done" ? (
              <Card>
                <CardContent className="flex flex-wrap items-center gap-3">
                  <ProcessingBadge status={candidate.processing_status} />
                  <p className="flex-1 text-sm">
                    {failedMessage ??
                      (candidate.processing_status === "processing"
                        ? t("detail.analyzing")
                        : t("detail.noAnalysis"))}
                  </p>
                  {candidate.processing_status !== "processing" ? (
                    <ProcessButton
                      orgId={org.id}
                      candidateId={candidate.id}
                      variant="default"
                      label={
                        candidate.processing_status === "failed"
                          ? t("detail.retry")
                          : t("detail.analyze")
                      }
                    />
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {analysis ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ListChecksIcon className="size-4 text-primary" aria-hidden />
                      {t("detail.matches.title")}
                    </CardTitle>
                    <CardDescription>
                      {t("detail.matches.summary", {
                        requiredMet: analysis.counts.requiredMet,
                        requiredTotal: analysis.counts.requiredTotal,
                        preferredMet: analysis.counts.preferredMet,
                        preferredTotal: analysis.counts.preferredTotal,
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3" aria-label={t("detail.matches.title")}>
                      {analysis.matches.map((match) => (
                        <li
                          key={match.id}
                          data-testid="requirement-match"
                          className="space-y-2 rounded-md border p-3 text-sm"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="flex-1 font-medium">{match.requirement_text}</span>
                            <Badge variant="secondary">
                              {match.requirement_kind === "required"
                                ? t("detail.matches.required")
                                : t("detail.matches.preferred")}
                            </Badge>
                            <MatchResultBadge result={match.result} />
                          </div>
                          {match.evidence ? (
                            <blockquote className="border-l-2 pl-3 text-muted-foreground italic">
                              «{match.evidence}»
                            </blockquote>
                          ) : null}
                          {match.result !== "not_found" ? (
                            match.evidence_verified ? (
                              <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                                <CheckCircle2Icon className="size-3.5" aria-hidden />
                                {match.evidence
                                  ? t("detail.matches.verified")
                                  : t("detail.matches.evidenceRemoved")}
                              </p>
                            ) : (
                              <p className="flex items-center gap-1.5 text-xs text-amber-800">
                                <TriangleAlertIcon className="size-3.5" aria-hidden />
                                {match.evidence
                                  ? t("detail.matches.unverified")
                                  : t("detail.matches.noEvidence")}
                              </p>
                            )
                          ) : null}
                          <p className="text-muted-foreground">
                            {match.explanation || t("detail.matches.notEvaluated")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t("detail.summary")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p>
                      {analysis.summary ||
                        (removedSummary ? t("detail.summaryRemoved") : t("detail.noAnalysis"))}
                    </p>
                    {analysis.guardFlags.length > 0 ? (
                      <p className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                        <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {t("detail.guard", { count: analysis.guardFlags.length })}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageCircleQuestionIcon className="size-4 text-primary" aria-hidden />
                      {t("detail.questions")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analysis.questions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("detail.noQuestions")}</p>
                    ) : (
                      <ol className="list-decimal space-y-2 pl-5 text-sm">
                        {analysis.questions.map((question, index) => (
                          <li key={index}>
                            <p>{question.question}</p>
                            {question.purpose ? (
                              <p className="text-xs text-muted-foreground">{question.purpose}</p>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t("detail.profile.title")}</CardTitle>
                    {analysis.profile.headline ? (
                      <CardDescription>{analysis.profile.headline}</CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
                    <div>
                      <h3 className="mb-1 text-xs text-muted-foreground">
                        {t("detail.profile.experience")}
                      </h3>
                      {analysis.profile.experience.length === 0 ? (
                        <p className="text-muted-foreground">{t("detail.profile.empty")}</p>
                      ) : (
                        <ul className="space-y-2">
                          {analysis.profile.experience.map((item, index) => (
                            <li key={index}>
                              <p className="font-medium">{item.role}</p>
                              <p className="text-xs text-muted-foreground">
                                {[item.organization, item.period].filter(Boolean).join(" · ")}
                              </p>
                              {item.highlights.length > 0 ? (
                                <ul className="mt-1 list-disc pl-4 text-xs">
                                  {item.highlights.map((highlight, position) => (
                                    <li key={position}>{highlight}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="space-y-3">
                      <div>
                        <h3 className="mb-1 text-xs text-muted-foreground">
                          {t("detail.profile.education")}
                        </h3>
                        {analysis.profile.education.length === 0 ? (
                          <p className="text-muted-foreground">{t("detail.profile.empty")}</p>
                        ) : (
                          <ul className="space-y-1">
                            {analysis.profile.education.map((item, index) => (
                              <li key={index}>
                                {item.title}
                                {item.institution || item.period ? (
                                  <span className="text-xs text-muted-foreground">
                                    {" · "}
                                    {[item.institution, item.period].filter(Boolean).join(" · ")}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <h3 className="mb-1 text-xs text-muted-foreground">
                          {t("detail.profile.languages")}
                        </h3>
                        <p>
                          {analysis.profile.languages.length === 0
                            ? t("detail.profile.empty")
                            : analysis.profile.languages
                                .map((item) =>
                                  item.level ? `${item.language} (${item.level})` : item.language,
                                )
                                .join(" · ")}
                        </p>
                      </div>
                      <div>
                        <h3 className="mb-1 text-xs text-muted-foreground">
                          {t("detail.profile.skills")}
                        </h3>
                        {analysis.profile.skills.length === 0 ? (
                          <p className="text-muted-foreground">{t("detail.profile.empty")}</p>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {analysis.profile.skills.map((skill) => (
                              <Badge key={skill} variant="outline">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      {analysis.profile.certifications.length > 0 ? (
                        <div>
                          <h3 className="mb-1 text-xs text-muted-foreground">
                            {t("detail.profile.certifications")}
                          </h3>
                          <p>{analysis.profile.certifications.join(" · ")}</p>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <p className="flex-1">
                    {t("detail.trace", {
                      prompt: `${analysis.promptId}@${analysis.promptVersion}`,
                      model: analysis.model,
                      date: when(analysis.createdAt),
                      person: person(analysis.requestedByName),
                    })}{" "}
                    · {t("detail.traceCount", { count: detail.analysesCount })}
                  </p>
                  {candidate.processing_status === "done" ? (
                    <ProcessButton
                      orgId={org.id}
                      candidateId={candidate.id}
                      label={t("detail.reanalyze")}
                    />
                  ) : null}
                </div>
              </>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileSearchIcon className="size-4 text-primary" aria-hidden />
                  {t("detail.redacted.title")}
                </CardTitle>
                <CardDescription>{t("detail.redacted.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                {candidate.redacted_text ? (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">
                      {t("detail.redacted.show")}
                    </summary>
                    <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                      {candidate.redacted_text}
                    </pre>
                  </details>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("detail.redacted.empty")}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardContent>
                <DecisionPanel
                  orgId={org.id}
                  candidateId={candidate.id}
                  status={candidate.status}
                  decidedBy={
                    candidate.status_changed_at
                      ? t("decision.by", {
                          person: person(detail.statusChangedByName),
                          date: when(candidate.status_changed_at),
                        })
                      : null
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <IdentityPanel
                  orgId={org.id}
                  candidateId={candidate.id}
                  anonymous={job.anonymous_review}
                  extracted={candidate.redacted_text !== null}
                  revealedAt={
                    candidate.identity_revealed_at ? when(candidate.identity_revealed_at) : null
                  }
                  identity={
                    pii
                      ? {
                          name: pii.full_name,
                          email: pii.email,
                          phone: pii.phone,
                          location: pii.location,
                          links: pii.links,
                          filename: pii.cv_filename,
                        }
                      : null
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HistoryIcon className="size-4 text-primary" aria-hidden />
                  {t("history.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
                ) : (
                  <ol className="space-y-3 text-sm" aria-label={t("history.title")}>
                    {events.map((event) => (
                      <li key={event.id} className="space-y-0.5">
                        <p className="font-medium">
                          {event.kind === "identity_revealed"
                            ? t("history.identityRevealed")
                            : t("history.statusChanged", {
                                from: event.fromStatus ? t(`statuses.${event.fromStatus}`) : "—",
                                to: event.toStatus ? t(`statuses.${event.toStatus}`) : "—",
                              })}
                        </p>
                        {event.note ? (
                          <p className="text-muted-foreground">«{event.note}»</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {t("history.by", {
                            person: person(event.actorName),
                            date: when(event.createdAt),
                          })}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>

            <DeleteCandidate orgId={org.id} candidateId={candidate.id} backHref={pipelineHref} />
          </div>
        </div>
      </div>
    </>
  );
}

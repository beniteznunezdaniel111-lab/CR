import "server-only";
import { cache } from "react";
import type { Enums, Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { AnalysisCounts, CandidateProfile, GuardFlag, InterviewQuestion } from "./analysis";
import { EMPTY_PROFILE } from "./analysis";
import { PROCESSING_STALE_MS } from "./constants";

/** Normaliza una relación 1:1 embebida (PostgREST puede devolver objeto o lista). */
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function countsOf(
  row: Pick<
    Tables<"cv_analyses">,
    "required_met" | "required_total" | "preferred_met" | "preferred_total"
  >,
): AnalysisCounts {
  return {
    requiredMet: row.required_met,
    requiredTotal: row.required_total,
    preferredMet: row.preferred_met,
    preferredTotal: row.preferred_total,
  };
}

export type CandidateListItem = {
  id: string;
  number: number;
  status: Enums<"candidate_status">;
  processingStatus: Enums<"cv_processing_status">;
  processingError: string | null;
  processingStartedAt: string | null;
  createdAt: string;
  retentionUntil: string;
  identityRevealedAt: string | null;
  /** null si la identidad está oculta (modo anónimo) o aún no se ha extraído. */
  name: string | null;
  filename: string | null;
  identityVisible: boolean;
  counts: AnalysisCounts | null;
  analyzedAt: string | null;
  /** "Analizando" desde hace demasiado: el procesado se interrumpió. */
  stale: boolean;
};

export async function listJobCandidates(
  orgId: string,
  jobId: string,
): Promise<CandidateListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select(
      `id, candidate_number, status, processing_status, processing_error, processing_started_at,
       created_at, retention_until, identity_revealed_at,
       candidate_pii (full_name, cv_filename),
       cv_analyses (required_met, required_total, preferred_met, preferred_total, created_at)`,
    )
    .eq("org_id", orgId)
    .eq("job_id", jobId)
    .order("candidate_number", { ascending: true })
    .order("created_at", { referencedTable: "cv_analyses", ascending: false })
    .limit(1, { referencedTable: "cv_analyses" });
  if (error) throw new Error(`No se pudieron cargar las candidaturas: ${error.message}`);

  const staleBefore = Date.now() - PROCESSING_STALE_MS;
  return (data ?? []).map((row) => {
    const pii = one(row.candidate_pii);
    const analysis = row.cv_analyses[0] ?? null;
    return {
      id: row.id,
      number: row.candidate_number,
      status: row.status,
      processingStatus: row.processing_status,
      processingError: row.processing_error,
      processingStartedAt: row.processing_started_at,
      createdAt: row.created_at,
      retentionUntil: row.retention_until,
      identityRevealedAt: row.identity_revealed_at,
      name: pii?.full_name ?? null,
      filename: pii?.cv_filename ?? null,
      identityVisible: pii !== null,
      counts: analysis ? countsOf(analysis) : null,
      analyzedAt: analysis?.created_at ?? null,
      stale:
        row.processing_status === "processing" &&
        (!row.processing_started_at || Date.parse(row.processing_started_at) < staleBefore),
    };
  });
}

export type JobCandidatesSummary = {
  jobId: string;
  title: string;
  jobStatus: Enums<"job_status">;
  anonymous: boolean;
  total: number;
  byStatus: Record<Enums<"candidate_status">, number>;
  failed: number;
};

/** Resumen por puesto para la página de candidaturas. */
export async function getCandidatesOverview(orgId: string): Promise<JobCandidatesSummary[]> {
  const supabase = await createClient();
  const [{ data: jobs, error: jobsError }, { data: candidates, error: candidatesError }] =
    await Promise.all([
      supabase
        .from("job_positions")
        .select("id, title, status, anonymous_review, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      supabase.from("candidates").select("job_id, status, processing_status").eq("org_id", orgId),
    ]);
  if (jobsError || candidatesError) {
    throw new Error("No se pudo cargar el resumen de candidaturas");
  }

  return (jobs ?? []).map((job) => {
    const rows = (candidates ?? []).filter((row) => row.job_id === job.id);
    const byStatus = { pending: 0, reviewed: 0, advance: 0, no_advance: 0 };
    for (const row of rows) byStatus[row.status] += 1;
    return {
      jobId: job.id,
      title: job.title,
      jobStatus: job.status,
      anonymous: job.anonymous_review,
      total: rows.length,
      byStatus,
      failed: rows.filter((row) => row.processing_status === "failed").length,
    };
  });
}

export type CandidateMatch = Pick<
  Tables<"cv_requirement_matches">,
  | "id"
  | "requirement_id"
  | "requirement_text"
  | "requirement_kind"
  | "result"
  | "evidence"
  | "evidence_verified"
  | "explanation"
  | "sort_order"
>;

export type CandidateEvent = {
  id: string;
  kind: Enums<"candidate_event_kind">;
  fromStatus: Enums<"candidate_status"> | null;
  toStatus: Enums<"candidate_status"> | null;
  note: string | null;
  actorName: string | null;
  createdAt: string;
};

export type CandidateDetail = {
  candidate: Tables<"candidates">;
  pii: Pick<
    Tables<"candidate_pii">,
    "full_name" | "email" | "phone" | "location" | "links" | "cv_filename"
  > | null;
  analysis: {
    id: string;
    summary: string;
    profile: CandidateProfile;
    questions: InterviewQuestion[];
    guardFlags: GuardFlag[];
    counts: AnalysisCounts;
    promptId: string;
    promptVersion: number;
    identityPromptId: string | null;
    identityPromptVersion: number | null;
    model: string;
    createdAt: string;
    requestedByName: string | null;
    matches: CandidateMatch[];
  } | null;
  analysesCount: number;
  events: CandidateEvent[];
  statusChangedByName: string | null;
};

export const getCandidateDetail = cache(
  async (orgId: string, candidateId: string): Promise<CandidateDetail | null> => {
    const supabase = await createClient();
    const { data: candidate } = await supabase
      .from("candidates")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", candidateId)
      .maybeSingle();
    if (!candidate) return null;

    const [{ data: pii }, { data: analyses }, { data: events }] = await Promise.all([
      supabase
        .from("candidate_pii")
        .select("full_name, email, phone, location, links, cv_filename")
        .eq("candidate_id", candidateId)
        .maybeSingle(),
      supabase
        .from("cv_analyses")
        .select("*, cv_requirement_matches (*)")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false }),
      supabase
        .from("candidate_events")
        .select("id, kind, from_status, to_status, note, actor_id, created_at")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false }),
    ]);

    const latest = analyses?.[0] ?? null;
    const peopleIds = [
      ...new Set(
        [
          latest?.requested_by,
          candidate.status_changed_by,
          ...(events ?? []).map((event) => event.actor_id),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    const { data: people } = peopleIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", peopleIds)
      : { data: [] };
    const nameOf = (id: string | null | undefined) => {
      if (!id) return null;
      const person = people?.find((item) => item.id === id);
      return person ? (person.full_name ?? person.email) : null;
    };

    return {
      candidate,
      pii: pii ?? null,
      analysis: latest
        ? {
            id: latest.id,
            summary: latest.summary,
            profile: { ...EMPTY_PROFILE, ...(latest.profile as Partial<CandidateProfile>) },
            questions: (latest.interview_questions as InterviewQuestion[]) ?? [],
            guardFlags: (latest.guard_flags as GuardFlag[]) ?? [],
            counts: countsOf(latest),
            promptId: latest.prompt_id,
            promptVersion: latest.prompt_version,
            identityPromptId: latest.identity_prompt_id,
            identityPromptVersion: latest.identity_prompt_version,
            model: latest.model,
            createdAt: latest.created_at,
            requestedByName: nameOf(latest.requested_by),
            matches: [...latest.cv_requirement_matches].sort((a, b) => a.sort_order - b.sort_order),
          }
        : null,
      analysesCount: analyses?.length ?? 0,
      events: (events ?? []).map((event) => ({
        id: event.id,
        kind: event.kind,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        note: event.note,
        actorName: nameOf(event.actor_id),
        createdAt: event.created_at,
      })),
      statusChangedByName: nameOf(candidate.status_changed_by),
    };
  },
);

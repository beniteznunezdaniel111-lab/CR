import "server-only";
import { cache } from "react";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { EMPTY_GUIDE, type GuideContent, type GuideFlag } from "./guide";

export type GuideSummary = {
  id: string;
  candidateId: string | null;
  createdAt: string;
  createdBy: string | null;
};

export async function listJobGuides(orgId: string, jobId: string): Promise<GuideSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interview_guides")
    .select("id, candidate_id, created_at, created_by")
    .eq("org_id", orgId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las guías: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    candidateId: row.candidate_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
  }));
}

export type Guide = Omit<Tables<"interview_guides">, "content" | "guard_flags"> & {
  content: GuideContent;
  guardFlags: GuideFlag[];
};

export const getGuide = cache(async (orgId: string, guideId: string): Promise<Guide | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("interview_guides")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", guideId)
    .maybeSingle();
  if (!data) return null;
  const { content, guard_flags, ...rest } = data;
  return {
    ...rest,
    content: { ...EMPTY_GUIDE, ...(content as Partial<GuideContent>) },
    guardFlags: (guard_flags as GuideFlag[]) ?? [],
  };
});

export type GuideCandidateOption = {
  id: string;
  number: number;
  name: string | null;
  analyzed: boolean;
};

/** Candidaturas del puesto para adaptar la guía (nombre solo si es visible). */
export async function listGuideCandidates(
  orgId: string,
  jobId: string,
): Promise<GuideCandidateOption[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("candidates")
    .select("id, candidate_number, processing_status, candidate_pii (full_name)")
    .eq("org_id", orgId)
    .eq("job_id", jobId)
    .order("candidate_number", { ascending: true });
  return (data ?? []).map((row) => {
    const pii = Array.isArray(row.candidate_pii) ? row.candidate_pii[0] : row.candidate_pii;
    return {
      id: row.id,
      number: row.candidate_number,
      name: pii?.full_name ?? null,
      analyzed: row.processing_status === "done",
    };
  });
}

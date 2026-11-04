import "server-only";
import { cache } from "react";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { InclusiveReview } from "./inclusive-review";

export type JobListItem = Pick<
  Tables<"job_positions">,
  "id" | "title" | "department" | "level" | "work_mode" | "status" | "updated_at"
> & { latestVersion: number | null; latestVersionAt: string | null };

/** Puestos de la empresa (RLS: solo admin y RRHH). */
export async function listJobs(orgId: string): Promise<JobListItem[]> {
  const supabase = await createClient();
  const [jobs, versions] = await Promise.all([
    supabase
      .from("job_positions")
      .select("id, title, department, level, work_mode, status, updated_at")
      .eq("org_id", orgId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("job_position_versions")
      .select("job_id, version_number, created_at")
      .eq("org_id", orgId)
      .order("version_number", { ascending: false }),
  ]);
  if (jobs.error) throw new Error(`No se pudieron cargar los puestos: ${jobs.error.message}`);
  if (versions.error)
    throw new Error(`No se pudieron cargar las versiones: ${versions.error.message}`);

  const latest = new Map<string, { number: number; at: string }>();
  for (const version of versions.data ?? []) {
    if (!latest.has(version.job_id)) {
      latest.set(version.job_id, { number: version.version_number, at: version.created_at });
    }
  }
  return (jobs.data ?? []).map((job) => ({
    ...job,
    latestVersion: latest.get(job.id)?.number ?? null,
    latestVersionAt: latest.get(job.id)?.at ?? null,
  }));
}

export type JobWithRequirements = Tables<"job_positions"> & {
  requirements: Pick<Tables<"job_requirements">, "id" | "text" | "kind" | "sort_order">[];
};

/** Puesto con sus requisitos (cacheado por petición: lo usan la página y sus metadatos). */
export const getJob = cache(async function getJob(
  orgId: string,
  jobId: string,
): Promise<JobWithRequirements | null> {
  const supabase = await createClient();
  const [job, requirements] = await Promise.all([
    supabase.from("job_positions").select("*").eq("org_id", orgId).eq("id", jobId).maybeSingle(),
    supabase
      .from("job_requirements")
      .select("id, text, kind, sort_order")
      .eq("org_id", orgId)
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true }),
  ]);
  if (job.error) throw new Error(`No se pudo cargar el puesto: ${job.error.message}`);
  if (!job.data) return null;
  return { ...job.data, requirements: requirements.data ?? [] };
});

export type JobVersionSummary = Pick<
  Tables<"job_position_versions">,
  | "id"
  | "version_number"
  | "source"
  | "restored_from_version"
  | "created_at"
  | "created_by"
  | "prompt_id"
  | "prompt_version"
  | "model"
>;

export async function listJobVersions(orgId: string, jobId: string): Promise<JobVersionSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("job_position_versions")
    .select(
      "id, version_number, source, restored_from_version, created_at, created_by, prompt_id, prompt_version, model",
    )
    .eq("org_id", orgId)
    .eq("job_id", jobId)
    .order("version_number", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar las versiones: ${error.message}`);
  return data ?? [];
}

export type JobVersion = Omit<Tables<"job_position_versions">, "inclusive_review"> & {
  inclusive_review: InclusiveReview | null;
};

/** Una versión concreta o, si no se indica, la más reciente. */
export async function getJobVersion(
  orgId: string,
  jobId: string,
  versionNumber?: number,
): Promise<JobVersion | null> {
  const supabase = await createClient();
  let query = supabase
    .from("job_position_versions")
    .select("*")
    .eq("org_id", orgId)
    .eq("job_id", jobId);
  query = versionNumber
    ? query.eq("version_number", versionNumber)
    : query.order("version_number", { ascending: false }).limit(1);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`No se pudo cargar la versión: ${error.message}`);
  return data
    ? { ...data, inclusive_review: data.inclusive_review as InclusiveReview | null }
    : null;
}

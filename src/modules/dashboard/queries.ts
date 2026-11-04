import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Pendientes de RRHH en la empresa (recuentos; la RLS limita a lo que puede ver). */
export async function getHrPending(orgId: string, today: string) {
  const supabase = await createClient();
  const [candidates, queries, onboarding, trainings, documents, clusters] = await Promise.all([
    supabase
      .from("candidates")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "pending")
      .eq("processing_status", "done"),
    supabase
      .from("hr_queries")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "open"),
    supabase
      .from("onboarding_assignment_tasks")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("completed_at", null)
      .lt("due_date", today),
    supabase
      .from("training_assignments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("passed_at", null)
      .lt("due_date", today),
    supabase
      .from("kb_documents")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("status", "ready"),
    supabase.rpc("faq_question_clusters", { p_org_id: orgId, p_days: 30 }),
  ]);
  return {
    candidates: candidates.count ?? 0,
    hrQueries: queries.count ?? 0,
    onboarding: onboarding.count ?? 0,
    trainings: trainings.count ?? 0,
    readyDocuments: documents.count ?? 0,
    faqUnanswered: (clusters.data ?? []).reduce((sum, row) => sum + row.unanswered, 0),
  };
}

/** Lo que tiene pendiente la persona: formaciones y respuestas recientes de RRHH. */
export async function getMyPending(orgId: string, userId: string) {
  const supabase = await createClient();
  const monthAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [{ data: assignments }, answered] = await Promise.all([
    supabase
      .from("training_assignments")
      .select("id, due_date, trainings(id)")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .is("passed_at", null),
    supabase
      .from("hr_queries")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("requester_id", userId)
      .eq("status", "answered")
      .gte("answered_at", monthAgo),
  ]);
  // Solo las publicadas (la RLS oculta la formación de las que no lo están).
  const pending = (assignments ?? []).filter((item) => item.trainings);
  const nextDue =
    pending
      .map((item) => item.due_date)
      .filter((date): date is string => Boolean(date))
      .sort()[0] ?? null;
  return { trainings: pending.length, nextDue, answeredQueries: answered.count ?? 0 };
}

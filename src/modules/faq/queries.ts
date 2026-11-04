import "server-only";
import { createClient } from "@/lib/supabase/server";
import { type FaqMessageView, toMessageView } from "./ask";

/** Documentos de la FAQ (RRHH ve todos; el resto, solo los listos: lo aplica la RLS). */
export async function listKbDocuments(orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_documents")
    .select(
      "id, title, doc_type, status, error, pages, chunk_count, embedding_model, file_mime, file_size, file_path, created_at, updated_at",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron cargar los documentos: ${error.message}`);
  return data ?? [];
}

export type KbDocumentRow = Awaited<ReturnType<typeof listKbDocuments>>[number];

export async function countReadyKbDocuments(orgId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("kb_documents")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "ready");
  return count ?? 0;
}

/** Conversaciones propias (la RLS no deja ver las de nadie más). */
export async function listConversations(orgId: string, limit = 30) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("faq_conversations")
    .select("id, title, updated_at")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getConversation(
  orgId: string,
  conversationId: string,
): Promise<{ id: string; title: string; messages: FaqMessageView[] } | null> {
  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("faq_conversations")
    .select("id, title")
    .eq("id", conversationId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!conversation) return null;
  const { data: messages } = await supabase
    .from("faq_messages")
    .select("id, role, content, outcome, segments, sources, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return { ...conversation, messages: (messages ?? []).map(toMessageView) };
}

/** Consultas a RRHH de la persona. */
export async function listMyHrQueries(orgId: string, userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hr_queries")
    .select("id, question, status, answer, answered_at, created_at")
    .eq("org_id", orgId)
    .eq("requester_id", userId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Bandeja de RRHH: todas las consultas con el nombre de quien pregunta. */
export async function listHrQueries(orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hr_queries")
    .select("id, question, status, answer, answered_at, answered_by, requester_id, created_at")
    .eq("org_id", orgId)
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const ids = [...new Set(rows.flatMap((row) => [row.requester_id, row.answered_by]))].filter(
    (id): id is string => Boolean(id),
  );
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);
    for (const profile of profiles ?? []) {
      names.set(profile.id, profile.full_name ?? profile.email ?? "");
    }
  }
  return rows.map((row) => ({
    ...row,
    requesterName: names.get(row.requester_id) ?? null,
    answeredByName: row.answered_by ? (names.get(row.answered_by) ?? null) : null,
  }));
}

/** Preguntas agrupadas por similitud, sin identificar a nadie (solo RRHH). */
export async function getQuestionClusters(orgId: string, days = 90) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("faq_question_clusters", {
    p_org_id: orgId,
    p_days: days,
  });
  if (error) throw new Error(`No se pudieron cargar las estadísticas: ${error.message}`);
  return data ?? [];
}

/** Avisos de la persona en esta empresa (los más recientes) y cuántos no ha leído. */
export async function listNotifications(orgId: string, limit = 15) {
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, kind, params, link, read_at, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .is("read_at", null),
  ]);
  return { items: data ?? [], unread: count ?? 0 };
}

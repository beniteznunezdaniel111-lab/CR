import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

/** Respuesta de descarga en JSON (datos personales: nunca en caché). */
export function jsonDownload(data: unknown, filename: string): Response {
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

async function trainingsOf(supabase: Client, orgId: string, userId: string) {
  const { data: assignments } = await supabase
    .from("training_assignments")
    .select(
      "id, due_date, best_score, attempt_count, passed_at, created_at, trainings(title), training_module_progress(module_id, completed_at), training_attempts(score, passed, correct_count, total, created_at)",
    )
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (assignments ?? []).map((item) => {
    const training = Array.isArray(item.trainings) ? item.trainings[0] : item.trainings;
    return {
      training: training?.title ?? null,
      assignedAt: item.created_at,
      dueDate: item.due_date,
      bestScore: item.best_score === null ? null : Number(item.best_score),
      passedAt: item.passed_at,
      completedModules: (item.training_module_progress ?? []).length,
      attempts: (item.training_attempts ?? []).map((attempt) => ({
        date: attempt.created_at,
        score: Number(attempt.score),
        passed: attempt.passed,
        correct: attempt.correct_count,
        total: attempt.total,
      })),
    };
  });
}

async function hrQueriesOf(supabase: Client, orgId: string, userId: string) {
  const { data } = await supabase
    .from("hr_queries")
    .select("question, status, answer, created_at, answered_at")
    .eq("org_id", orgId)
    .eq("requester_id", userId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => ({
    question: row.question,
    status: row.status,
    answer: row.answer,
    sentAt: row.created_at,
    answeredAt: row.answered_at,
  }));
}

/** Exportación de los datos propios de la persona en la empresa (incluye su chat). */
export async function buildMyDataExport(
  supabase: Client,
  org: { id: string; name: string; country: string },
  userId: string,
) {
  const [{ data: profile }, { data: membership }, { data: conversations }, { data: notices }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, created_at")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("role, status, created_at")
        .eq("org_id", org.id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("faq_conversations")
        .select("title, created_at, faq_messages(role, content, outcome, created_at)")
        .eq("org_id", org.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("notifications")
        .select("kind, params, created_at, read_at")
        .eq("org_id", org.id)
        .order("created_at", { ascending: true }),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    organization: { name: org.name, country: org.country },
    person: { name: profile?.full_name ?? null, email: profile?.email ?? null },
    membership: membership
      ? { role: membership.role, status: membership.status, since: membership.created_at }
      : null,
    faqConversations: (conversations ?? []).map((conversation) => ({
      title: conversation.title,
      createdAt: conversation.created_at,
      messages: [...(conversation.faq_messages ?? [])]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((message) => ({
          role: message.role,
          content: message.content,
          outcome: message.outcome,
          date: message.created_at,
        })),
    })),
    hrQueries: await hrQueriesOf(supabase, org.id, userId),
    trainings: await trainingsOf(supabase, org.id, userId),
    notifications: (notices ?? []).map((notice) => ({
      kind: notice.kind,
      params: notice.params,
      date: notice.created_at,
      readAt: notice.read_at,
    })),
  };
}

/** Exportación de un miembro hecha por el admin (sin su chat, que es privado). */
export async function buildMemberExport(
  supabase: Client,
  org: { id: string; name: string },
  userId: string,
) {
  const [{ data: profile }, { data: membership }, { data: onboarding }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
    supabase
      .from("memberships")
      .select("role, status, created_at")
      .eq("org_id", org.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("onboarding_assignments")
      .select(
        "plan_title, employee_name, employee_email, start_date, created_at, onboarding_assignment_tasks(title, phase, due_date, completed_at)",
      )
      .eq("org_id", org.id)
      .eq("member_user_id", userId),
  ]);
  if (!membership) return null;

  return {
    generatedAt: new Date().toISOString(),
    organization: { name: org.name },
    person: { name: profile?.full_name ?? null, email: profile?.email ?? null },
    membership: { role: membership.role, status: membership.status, since: membership.created_at },
    hrQueries: await hrQueriesOf(supabase, org.id, userId),
    trainings: await trainingsOf(supabase, org.id, userId),
    onboarding: (onboarding ?? []).map((item) => ({
      plan: item.plan_title,
      name: item.employee_name,
      email: item.employee_email,
      startDate: item.start_date,
      tasks: (item.onboarding_assignment_tasks ?? []).map((task) => ({
        title: task.title,
        phase: task.phase,
        dueDate: task.due_date,
        completedAt: task.completed_at,
      })),
    })),
    note: "Las conversaciones del chat de la FAQ son privadas: la persona puede exportarlas desde su menú («Exportar mis datos»).",
  };
}

/** Exportación de los datos de una candidatura (derecho de acceso de la persona candidata). */
export async function buildCandidateExport(supabase: Client, orgId: string, candidateId: string) {
  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, candidate_number, status, status_changed_at, processing_status, created_at, retention_until, identity_revealed_at, cv_mime, cv_size, job_positions(title)",
    )
    .eq("id", candidateId)
    .eq("org_id", orgId)
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
      .select(
        "summary, profile, required_met, required_total, preferred_met, preferred_total, model, prompt_id, prompt_version, created_at, cv_requirement_matches(requirement_text, requirement_kind, result, evidence, evidence_verified, explanation, sort_order)",
      )
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: true }),
    supabase
      .from("candidate_events")
      .select("kind, from_status, to_status, note, created_at")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: true }),
  ]);
  const job = Array.isArray(candidate.job_positions)
    ? candidate.job_positions[0]
    : candidate.job_positions;

  return {
    generatedAt: new Date().toISOString(),
    candidate: {
      reference: `#${candidate.candidate_number}`,
      job: job?.title ?? null,
      status: candidate.status,
      statusChangedAt: candidate.status_changed_at,
      receivedAt: candidate.created_at,
      retentionUntil: candidate.retention_until,
      cv: { type: candidate.cv_mime, size: candidate.cv_size, filename: pii?.cv_filename ?? null },
    },
    // Si el puesto es anónimo y no se ha revelado la identidad, RRHH no la ve:
    // la persona puede pedirla y RRHH revelarla (queda registrado) antes de exportar.
    identity: pii
      ? {
          name: pii.full_name,
          email: pii.email,
          phone: pii.phone,
          location: pii.location,
          links: pii.links,
        }
      : null,
    analyses: (analyses ?? []).map((analysis) => ({
      date: analysis.created_at,
      summary: analysis.summary,
      profile: analysis.profile,
      counts: {
        required: `${analysis.required_met}/${analysis.required_total}`,
        preferred: `${analysis.preferred_met}/${analysis.preferred_total}`,
      },
      generatedWith: `${analysis.prompt_id}@${analysis.prompt_version} (${analysis.model})`,
      requirements: [...(analysis.cv_requirement_matches ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((match) => ({
          requirement: match.requirement_text,
          kind: match.requirement_kind,
          result: match.result,
          evidence: match.evidence,
          evidenceVerified: match.evidence_verified,
          explanation: match.explanation,
        })),
    })),
    history: (events ?? []).map((event) => ({
      date: event.created_at,
      kind: event.kind,
      from: event.from_status,
      to: event.to_status,
      note: event.note,
    })),
  };
}

import "server-only";
import { type BudgetStatus, computeBudgetStatus } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import type { UsageRow } from "./summary";

/** Tope y gasto del mes (solo para admins: la función no devuelve nada a otros roles). */
export async function getBudgetStatus(orgId: string): Promise<BudgetStatus | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("org_ai_budget_status", { p_org_id: orgId });
  const row = data?.[0];
  if (!row) return null;
  return computeBudgetStatus(Number(row.limit_usd), Number(row.spent_usd));
}

/** Llamadas de los últimos meses (RLS: solo admins leen ai_usage). */
export async function listUsage(orgId: string, since: Date) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_usage")
    .select(
      "id, created_at, user_id, feature, prompt_id, prompt_version, provider, model, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, cost_usd_est, status, error_code",
    )
    .eq("org_id", orgId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(5000);
  const rows = (data ?? []).map((row) => ({ ...row, cost_usd_est: Number(row.cost_usd_est) }));

  const userIds = [...new Set(rows.slice(0, 50).map((row) => row.user_id))].filter(
    (id): id is string => Boolean(id),
  );
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    for (const profile of profiles ?? []) {
      names.set(profile.id, profile.full_name ?? profile.email ?? "");
    }
  }
  return {
    rows: rows satisfies UsageRow[],
    recent: rows.slice(0, 50).map((row) => ({
      ...row,
      userName: row.user_id ? (names.get(row.user_id) ?? null) : null,
    })),
  };
}

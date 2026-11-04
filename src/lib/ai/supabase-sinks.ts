import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { AiError } from "./errors";
import { type BudgetGuard, type UsageRecorder, computeBudgetStatus } from "./usage";

/**
 * Registro de uso en `ai_usage` con la clave de servidor (la tabla no admite
 * escrituras de usuarios). Si falla, no rompe la acción del usuario: se registra
 * el error en logs.
 */
export function createSupabaseUsageRecorder(): UsageRecorder {
  return {
    async record(entry) {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("ai_usage")
        .insert({
          org_id: entry.orgId,
          user_id: entry.userId,
          feature: entry.feature,
          prompt_id: entry.promptId,
          prompt_version: entry.promptVersion,
          provider: entry.provider,
          model: entry.model,
          input_tokens: entry.usage.inputTokens,
          output_tokens: entry.usage.outputTokens,
          cache_creation_input_tokens: entry.usage.cacheCreationInputTokens,
          cache_read_input_tokens: entry.usage.cacheReadInputTokens,
          cost_usd_est: entry.costUsd,
          duration_ms: entry.durationMs,
          status: entry.status,
          attempts: entry.attempts,
          error_code: entry.errorCode ?? null,
          request_id: entry.requestId,
        })
        .select("id")
        .single();
      if (error) {
        console.error("[ai] No se pudo registrar el uso de IA:", error.message);
        return null;
      }
      return data.id;
    },
  };
}

/** Tope mensual de gasto por empresa (organizations.ai_monthly_budget_usd). */
export function createSupabaseBudgetGuard(): BudgetGuard {
  return {
    async check(orgId) {
      const admin = createAdminClient();
      const [orgResult, spendResult] = await Promise.all([
        admin.from("organizations").select("ai_monthly_budget_usd").eq("id", orgId).single(),
        admin.rpc("org_ai_spend_current_month", { p_org: orgId }),
      ]);
      if (orgResult.error || spendResult.error) {
        // Sin poder comprobar el tope, no se gasta (fallo cerrado).
        throw new AiError("provider_error", {
          detail: `No se pudo comprobar el tope de IA: ${orgResult.error?.message ?? spendResult.error?.message}`,
        });
      }
      return computeBudgetStatus(
        Number(orgResult.data.ai_monthly_budget_usd),
        Number(spendResult.data ?? 0),
      );
    },
  };
}

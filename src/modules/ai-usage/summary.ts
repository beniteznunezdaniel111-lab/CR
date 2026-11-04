/**
 * Resumen del consumo de IA de una empresa (para el admin): por mes, por módulo
 * y estado del tope. Funciones puras: la consulta está en queries.ts.
 */
import { type BudgetStatus, computeBudgetStatus } from "@/lib/ai";

export type UsageRow = {
  created_at: string;
  feature: string;
  status: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd_est: number;
};

/** Mes en formato AAAA-MM (UTC, igual que el tope en la base de datos). */
export function monthKey(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Los últimos `count` meses, del más reciente al más antiguo. */
export function lastMonths(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))),
  );
}

export type FeatureSummary = {
  feature: string;
  calls: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export function summarizeByFeature(rows: readonly UsageRow[], month: string): FeatureSummary[] {
  const byFeature = new Map<string, FeatureSummary>();
  for (const row of rows) {
    if (monthKey(row.created_at) !== month) continue;
    const current = byFeature.get(row.feature) ?? {
      feature: row.feature,
      calls: 0,
      errors: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    current.calls += 1;
    if (row.status !== "ok") current.errors += 1;
    current.inputTokens +=
      row.input_tokens + row.cache_read_input_tokens + row.cache_creation_input_tokens;
    current.outputTokens += row.output_tokens;
    current.costUsd += Number(row.cost_usd_est);
    byFeature.set(row.feature, current);
  }
  return [...byFeature.values()].sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
}

export function summarizeByMonth(
  rows: readonly UsageRow[],
  months: readonly string[],
): { month: string; calls: number; costUsd: number }[] {
  return months.map((month) => {
    const inMonth = rows.filter((row) => monthKey(row.created_at) === month);
    return {
      month,
      calls: inMonth.length,
      costUsd: inMonth.reduce((sum, row) => sum + Number(row.cost_usd_est), 0),
    };
  });
}

export type BudgetLevel = "ok" | "warning" | "exceeded";

export function budgetLevel(status: BudgetStatus): BudgetLevel {
  if (status.exceeded) return "exceeded";
  return status.warning ? "warning" : "ok";
}

export { computeBudgetStatus };

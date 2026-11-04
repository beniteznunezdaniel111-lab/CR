import type { AiProvider, AiUsageTotals } from "./types";

export type AiUsageStatus = "ok" | "error" | "validation_failed" | "refused" | "budget_exceeded";

export type AiUsageEntry = {
  orgId: string;
  userId: string | null;
  feature: string;
  promptId: string;
  promptVersion: number;
  provider: AiProvider;
  model: string;
  usage: AiUsageTotals;
  costUsd: number;
  durationMs: number;
  status: AiUsageStatus;
  attempts: number;
  errorCode?: string | null;
  requestId: string | null;
};

/** Destino del registro de uso (Supabase en la app; memoria en tests). */
export interface UsageRecorder {
  record(entry: AiUsageEntry): Promise<number | null>;
}

export type BudgetStatus = {
  limitUsd: number;
  spentUsd: number;
  ratio: number;
  exceeded: boolean;
  /** A partir del 80 % se avisa al admin. */
  warning: boolean;
};

export interface BudgetGuard {
  check(orgId: string): Promise<BudgetStatus>;
}

export function computeBudgetStatus(limitUsd: number, spentUsd: number): BudgetStatus {
  const ratio = limitUsd > 0 ? spentUsd / limitUsd : 1;
  return {
    limitUsd,
    spentUsd,
    ratio,
    exceeded: limitUsd <= 0 || spentUsd >= limitUsd,
    warning: ratio >= 0.8,
  };
}

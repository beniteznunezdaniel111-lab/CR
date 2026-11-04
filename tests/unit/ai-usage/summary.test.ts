import { describe, expect, it } from "vitest";
import {
  budgetLevel,
  computeBudgetStatus,
  lastMonths,
  monthKey,
  summarizeByFeature,
  summarizeByMonth,
  type UsageRow,
} from "@/modules/ai-usage/summary";

const row = (created_at: string, feature: string, cost: number, status = "ok"): UsageRow => ({
  created_at,
  feature,
  status,
  input_tokens: 100,
  output_tokens: 50,
  cache_read_input_tokens: 10,
  cache_creation_input_tokens: 0,
  cost_usd_est: cost,
});

describe("resumen de uso de IA", () => {
  it("agrupa por mes (UTC) los últimos meses, del más reciente al más antiguo", () => {
    expect(monthKey("2026-11-30T23:30:00Z")).toBe("2026-11");
    expect(lastMonths(new Date("2026-02-10T00:00:00Z"), 3)).toEqual([
      "2026-02",
      "2026-01",
      "2025-12",
    ]);
    const rows = [row("2026-02-01T10:00:00Z", "faq", 0.5), row("2025-12-31T10:00:00Z", "jobs", 1)];
    expect(summarizeByMonth(rows, ["2026-02", "2026-01", "2025-12"])).toEqual([
      { month: "2026-02", calls: 1, costUsd: 0.5 },
      { month: "2026-01", calls: 0, costUsd: 0 },
      { month: "2025-12", calls: 1, costUsd: 1 },
    ]);
  });

  it("suma por módulo el mes pedido, con errores y tokens (incluida la caché)", () => {
    const rows = [
      row("2026-11-03T10:00:00Z", "faq", 0.25),
      row("2026-11-04T10:00:00Z", "faq", 0.25, "error"),
      row("2026-11-04T11:00:00Z", "trainings", 1),
      row("2026-10-04T11:00:00Z", "faq", 9),
    ];
    expect(summarizeByFeature(rows, "2026-11")).toEqual([
      { feature: "trainings", calls: 1, errors: 0, inputTokens: 110, outputTokens: 50, costUsd: 1 },
      { feature: "faq", calls: 2, errors: 1, inputTokens: 220, outputTokens: 100, costUsd: 0.5 },
    ]);
  });

  it("avisa a partir del 80 % y bloquea al 100 %", () => {
    expect(budgetLevel(computeBudgetStatus(20, 10))).toBe("ok");
    expect(budgetLevel(computeBudgetStatus(20, 16))).toBe("warning");
    expect(budgetLevel(computeBudgetStatus(20, 20))).toBe("exceeded");
  });
});

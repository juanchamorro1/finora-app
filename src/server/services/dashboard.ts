import { currentMonthRange, localMidnight, localParts } from "@/lib/dates";
import type { Db } from "../db-client";
import { getNetWorth } from "./accounts";
import { byMonth, loadFlows, totals } from "./analytics";
import { getBudgetSummary } from "./budgets";
import { listGoals } from "./goals";
import { recentTransactions } from "./transactions";

/** Todo lo que necesita la pantalla principal, en una sola llamada. */
export async function getDashboard(db: Db, userId: string, now: Date = new Date()) {
  const month = currentMonthRange(now);
  const { year, month: m } = localParts(now);
  const chartRange = { from: localMidnight(year, m - 5, 1), to: month.to };

  const [netWorth, chartFlows, recent, goals] = await Promise.all([
    getNetWorth(db, userId),
    loadFlows(db, userId, chartRange),
    recentTransactions(db, userId, 6),
    listGoals(db, userId, { now }),
  ]);
  const monthFlows = chartFlows.flows.filter((f) => f.date >= month.from && f.date < month.to);
  const budgets = await getBudgetSummary(db, userId, monthFlows);

  return {
    netWorth,
    month: { range: month, ...totals(monthFlows) },
    budgets,
    recent,
    goals: goals.filter((g) => g.status === "ACTIVE").slice(0, 3),
    /** Total guardado en metas (activas y completadas): dinero que ya no está en las cuentas para gastar. */
    savedInGoals: goals.reduce((sum, g) => sum + g.saved, 0n),
    completedGoals: goals.filter((g) => g.status === "COMPLETED").length,
    chart: byMonth(chartFlows.flows, chartRange),
    excludedCurrencies: chartFlows.excludedCurrencies,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

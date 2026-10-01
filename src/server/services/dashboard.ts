import { currentMonthRange, localMidnight, localParts } from "@/lib/dates";
import type { Db } from "../db-client";
import { getNetWorth } from "./accounts";
import { byMonth, loadFlows, totals } from "./analytics";
import { getBudgetSummary } from "./budgets";
import { listGoals } from "./goals";
import { recentTransactions } from "./transactions";

/** Todo lo que necesita la pantalla principal, en una sola llamada. */
export async function getDashboard(db: Db, now: Date = new Date()) {
  const month = currentMonthRange(now);
  const { year, month: m } = localParts(now);
  const chartRange = { from: localMidnight(year, m - 5, 1), to: month.to };

  const [netWorth, chartFlows, recent, goals] = await Promise.all([
    getNetWorth(db),
    loadFlows(db, chartRange),
    recentTransactions(db, 6),
    listGoals(db, { now }),
  ]);
  const monthFlows = chartFlows.flows.filter((f) => f.date >= month.from && f.date < month.to);
  const budgets = await getBudgetSummary(db, monthFlows);

  return {
    netWorth,
    month: { range: month, ...totals(monthFlows) },
    budgets,
    recent,
    goals: goals.filter((g) => g.status === "ACTIVE").slice(0, 3),
    completedGoals: goals.filter((g) => g.status === "COMPLETED").length,
    chart: byMonth(chartFlows.flows, chartRange),
    excludedCurrencies: chartFlows.excludedCurrencies,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;

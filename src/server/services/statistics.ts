import { monthKeysInRange, type DateRange } from "@/lib/dates";
import { percentOf } from "@/lib/money";
import type { Db } from "../db-client";
import {
  byCategory,
  byMonth,
  dailyAverageExpense,
  expenseByDay,
  largestExpense,
  loadFlows,
  totals,
} from "./analytics";
import { analyzeAntExpenses } from "./ant-expenses";
import { getAntThreshold } from "./settings";

/**
 * Estadísticas de un periodo. Es la misma fuente que usará el asistente de IA
 * ("¿en qué gasto más?", "¿cuánto gasté este mes?", etc.).
 */
export async function getStatistics(db: Db, userId: string, range: DateRange, now: Date = new Date()) {
  const [{ flows, excludedCurrencies }, antThreshold] = await Promise.all([
    loadFlows(db, userId, range),
    getAntThreshold(db, userId),
  ]);
  const t = totals(flows);
  const expenseCategories = byCategory(flows, "EXPENSE");
  return {
    range,
    totals: t,
    /** % de los ingresos que se ahorró (puede ser negativo). */
    savingsRate: percentOf(t.savings, t.income),
    dailyAverage: dailyAverageExpense(flows, range, now),
    largestExpense: largestExpense(flows),
    topCategory: expenseCategories[0] ?? null,
    expenseByCategory: expenseCategories,
    incomeByCategory: byCategory(flows, "INCOME"),
    monthly: byMonth(flows, range),
    daily: expenseByDay(flows),
    multiMonth: monthKeysInRange(range).length > 1,
    ant: analyzeAntExpenses(flows, antThreshold, range, now),
    excludedCurrencies,
  };
}

export type Statistics = Awaited<ReturnType<typeof getStatistics>>;

import { z } from "zod";
import { addDays, currentMonthRange, localParts, startOfDay } from "@/lib/dates";
import { divRound, formatMoney } from "@/lib/money";
import { PERIOD_PRESETS, resolvePeriod, type PeriodPreset } from "@/lib/periods";
import type { Db } from "../db-client";
import { getNetWorth } from "../services/accounts";
import { byCategory, loadFlows, totals } from "../services/analytics";
import { analyzeAntExpenses } from "../services/ant-expenses";
import { getBudgetSummary } from "../services/budgets";
import { listGoals } from "../services/goals";
import { getAntThreshold } from "../services/settings";

/**
 * Catálogo de herramientas de SOLO LECTURA para un futuro asistente de IA.
 *
 * Cada herramienta tiene nombre, descripción, esquema de entrada (Zod → JSON
 * Schema con `z.toJSONSchema`) y un handler que reutiliza los mismos servicios
 * que la interfaz, así las respuestas del asistente siempre coinciden con lo que
 * se ve en pantalla. Ninguna herramienta modifica datos.
 *
 * Integración futura (no incluida en la V1): pasar `assistantTools` como tools
 * del modelo y ejecutar `runAssistantTool(db, name, input)` cuando lo pida.
 * Los montos se devuelven como texto formateado en COP para evitar errores de
 * precisión al serializar BigInt.
 */

const periodInput = z.object({
  period: z
    .enum(Object.keys(PERIOD_PRESETS).filter((k) => k !== "custom") as [PeriodPreset, ...PeriodPreset[]])
    .default("this-month")
    .describe("Periodo: this-month, last-month, last-3-months, last-6-months o this-year"),
});

const money = (v: bigint) => formatMoney(v);

interface AssistantTool<S extends z.ZodType> {
  name: string;
  description: string;
  input: S;
  run: (db: Db, userId: string, input: z.output<S>, now: Date) => Promise<unknown>;
}

function tool<S extends z.ZodType>(t: AssistantTool<S>) {
  return t;
}

export const assistantTools = [
  tool({
    name: "get_spending_summary",
    description: "Ingresos, gastos y ahorro de un periodo. Responde '¿Cuánto gasté este mes?'.",
    input: periodInput,
    async run(db, userId, { period }, now) {
      const range = resolvePeriod(period, { now });
      const { flows, excludedCurrencies } = await loadFlows(db, userId, range);
      const t = totals(flows);
      return { period: range.label, income: money(t.income), expenses: money(t.expense), savings: money(t.net), excludedCurrencies };
    },
  }),
  tool({
    name: "get_top_expense_categories",
    description: "Categorías en las que más se gastó en un periodo. Responde '¿En qué gasto más?'.",
    input: periodInput.extend({ limit: z.number().int().min(1).max(10).default(5) }),
    async run(db, userId, { period, limit }, now) {
      const range = resolvePeriod(period, { now });
      const { flows } = await loadFlows(db, userId, range);
      return byCategory(flows, "EXPENSE")
        .slice(0, limit)
        .map((c) => ({ category: c.name, total: money(c.total), sharePercent: c.share, transactions: c.count }));
    },
  }),
  tool({
    name: "get_weekly_allowance",
    description:
      "Cuánto se puede gastar en lo que queda de semana según los presupuestos del mes. Responde '¿Cuánto puedo gastar esta semana?'.",
    input: z.object({}),
    async run(db, userId, _input, now) {
      const month = currentMonthRange(now);
      const { flows } = await loadFlows(db, userId, month);
      const summary = await getBudgetSummary(db, userId, flows);
      if (summary.budgets.length === 0) return { available: false, reason: "No hay presupuestos definidos." };
      const today = startOfDay(now);
      const daysLeftInMonth = Math.max(1, Math.round((month.to.getTime() - today.getTime()) / 86_400_000));
      // Días hasta el domingo (inclusive) sin pasar del fin de mes.
      const weekday = localParts(now).weekday; // 0 = domingo
      const daysLeftInWeek = Math.min(daysLeftInMonth, weekday === 0 ? 1 : 8 - weekday);
      const remaining = summary.totalRemaining > 0n ? summary.totalRemaining : 0n;
      return {
        available: true,
        budgetRemainingThisMonth: money(summary.totalRemaining),
        daysLeftInMonth,
        safeToSpendThisWeek: money(divRound(remaining * BigInt(daysLeftInWeek), BigInt(daysLeftInMonth))),
        weekEnds: addDays(today, daysLeftInWeek - 1).toISOString().slice(0, 10),
        overBudgetCategories: summary.budgets.filter((b) => b.level === "over").map((b) => b.category.name),
      };
    },
  }),
  tool({
    name: "get_goals_progress",
    description:
      "Progreso de las metas de ahorro y cuánto ahorrar por mes/semana para llegar a tiempo. Responde '¿Cómo voy con mi meta?' y '¿Cuánto debería ahorrar?'.",
    input: z.object({ name: z.string().optional().describe("Filtra por nombre de meta (opcional)") }),
    async run(db, userId, { name }, now) {
      const goals = await listGoals(db, userId, { now });
      return goals
        .filter((g) => !name || g.name.toLowerCase().includes(name.toLowerCase()))
        .map((g) => ({
          goal: g.name,
          status: g.status,
          saved: money(g.saved),
          target: money(g.targetAmount),
          percent: g.percent,
          remaining: money(g.remaining),
          targetDate: g.targetDate?.toISOString().slice(0, 10) ?? null,
          daysLeft: g.daysLeft,
          requiredPerMonth: g.requiredPerMonth !== null ? money(g.requiredPerMonth) : null,
          requiredPerWeek: g.requiredPerWeek !== null ? money(g.requiredPerWeek) : null,
          projectedCompletion: g.projectedDate?.toISOString().slice(0, 10) ?? null,
        }));
    },
  }),
  tool({
    name: "get_ant_expenses",
    description: "Posibles gastos hormiga (gastos pequeños y frecuentes) de un periodo. Responde '¿Cuánto gasté en gastos hormiga?'.",
    input: periodInput,
    async run(db, userId, { period }, now) {
      const range = resolvePeriod(period, { now });
      const [{ flows }, threshold] = await Promise.all([loadFlows(db, userId, range), getAntThreshold(db, userId)]);
      const a = analyzeAntExpenses(flows, threshold, range, now);
      return {
        period: range.label,
        threshold: money(threshold),
        count: a.count,
        total: money(a.total),
        shareOfExpensesPercent: a.shareOfExpenses,
        yearlyEstimate: money(a.yearlyEstimate),
        topPatterns: a.patterns.slice(0, 5).map((p) => ({ description: p.label, times: p.count, total: money(p.total) })),
      };
    },
  }),
  tool({
    name: "get_net_worth",
    description: "Dinero total en las cuentas activas y desglose por moneda.",
    input: z.object({}),
    async run(db, userId) {
      const w = await getNetWorth(db, userId);
      return {
        totalCOP: money(w.totalBase),
        byCurrency: w.byCurrency.map((c) => ({ currency: c.currency, total: formatMoney(c.total, c.currency) })),
        currenciesWithoutRate: w.missingRates,
      };
    },
  }),
];

export type AssistantToolName = (typeof assistantTools)[number]["name"];

/** Definiciones listas para enviar a un modelo (nombre, descripción, JSON Schema). */
export function assistantToolDefinitions() {
  return assistantTools.map((t) => ({ name: t.name, description: t.description, input_schema: z.toJSONSchema(t.input) }));
}

/** Ejecuta una herramienta validando su entrada, siempre sobre los datos de `userId`. */
export async function runAssistantTool(db: Db, userId: string, name: string, input: unknown, now: Date = new Date()) {
  const t = assistantTools.find((x) => x.name === name);
  if (!t) throw new Error(`Herramienta desconocida: ${name}`);
  const parsed = t.input.parse(input ?? {});
  return (t.run as (db: Db, userId: string, input: unknown, now: Date) => Promise<unknown>)(db, userId, parsed, now);
}

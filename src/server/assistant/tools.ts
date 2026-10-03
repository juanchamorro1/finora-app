import { z } from "zod";
import { addDays, currentMonthRange, dateKeyToInstant, isValidDateKey, localParts, startOfDay, toDateKey } from "@/lib/dates";
import { divRound, formatMoney, parseMoney } from "@/lib/money";
import { sameName } from "@/lib/text";
import { PERIOD_PRESETS, resolvePeriod, type PeriodPreset } from "@/lib/periods";
import type { Db } from "../db-client";
import { DomainError } from "../errors";
import { getNetWorth, listAccounts } from "../services/accounts";
import { byCategory, loadFlows, totals } from "../services/analytics";
import { analyzeAntExpenses } from "../services/ant-expenses";
import { getBudgetSummary } from "../services/budgets";
import { listCategories } from "../services/categories";
import { listGoals } from "../services/goals";
import { getAntThreshold } from "../services/settings";
import { createTransaction, recentTransactions, trashTransaction } from "../services/transactions";

/**
 * Herramientas del asistente (WhatsApp). Cada una tiene nombre, descripción,
 * esquema de entrada (Zod → JSON Schema con `z.toJSONSchema`) y un handler que
 * reutiliza los mismos servicios que la interfaz, así lo que dice el asistente
 * coincide con lo que se ve en pantalla. Todas trabajan solo con los datos de
 * `userId`. Las de escritura (registrar, deshacer) pasan por las mismas
 * validaciones que los formularios.
 *
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
      return {
        period: range.label,
        income: money(t.income),
        expenses: money(t.expense),
        savedInGoals: money(t.saved),
        savings: money(t.savings),
        excludedCurrencies,
      };
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
  tool({
    name: "get_accounts",
    description: "Cuentas activas del usuario con su saldo y moneda. Úsala para saber en qué cuenta registrar.",
    input: z.object({}),
    async run(db, userId) {
      const accounts = await listAccounts(db, userId);
      return accounts.map((a) => ({ name: a.name, currency: a.currency, balance: formatMoney(a.balance, a.currency) }));
    },
  }),
  tool({
    name: "get_categories",
    description: "Categorías disponibles para gastos (EXPENSE) e ingresos (INCOME).",
    input: z.object({}),
    async run(db, userId) {
      const categories = (await listCategories(db, userId)).filter((c) => !c.systemKey);
      return {
        expense: categories.filter((c) => c.kind === "EXPENSE").map((c) => c.name),
        income: categories.filter((c) => c.kind === "INCOME").map((c) => c.name),
      };
    },
  }),
  tool({
    name: "record_transaction",
    description:
      "Registra un gasto (EXPENSE) o un ingreso (INCOME). Usa los nombres exactos de get_accounts y get_categories. " +
      "El monto va en la moneda de la cuenta, como número sin símbolos (ej. '8000' para 8 mil).",
    input: z.object({
      type: z.enum(["EXPENSE", "INCOME"]),
      amount: z.string().min(1).max(30).describe("Monto, ej. '8000' o '12,50'"),
      account: z.string().min(1).max(60).describe("Nombre de la cuenta"),
      category: z.string().min(1).max(60).describe("Nombre de la categoría"),
      description: z.string().max(120).optional().describe("Detalle corto, ej. 'Papitas'"),
      date: z.string().optional().describe("YYYY-MM-DD; omitir si fue hoy"),
    }),
    async run(db, userId, input, now) {
      const account = await findAccount(db, userId, input.account);
      const kind = input.type;
      const categories = (await listCategories(db, userId, { kind })).filter((c) => !c.systemKey);
      const category = pickByName(categories, input.category, "categoría");
      const tx = await createTransaction(db, userId, {
        type: kind,
        amount: positiveAmount(input.amount, account.currency),
        accountId: account.id,
        categoryId: category.id,
        date: parseDate(input.date, now),
        description: input.description,
      });
      const balance = (await listAccounts(db, userId)).find((a) => a.id === account.id)?.balance ?? 0n;
      return {
        recorded: kind === "EXPENSE" ? "gasto" : "ingreso",
        amount: formatMoney(tx.amount, account.currency),
        account: account.name,
        category: category.name,
        description: tx.description,
        date: toDateKey(tx.date),
        newBalance: formatMoney(balance, account.currency),
      };
    },
  }),
  tool({
    name: "record_transfer",
    description: "Mueve dinero entre dos cuentas del usuario (no es ingreso ni gasto).",
    input: z.object({
      amount: z.string().min(1).max(30).describe("Monto que sale, en la moneda de la cuenta de origen"),
      from_account: z.string().min(1).max(60),
      to_account: z.string().min(1).max(60),
      received_amount: z.string().max(30).optional().describe("Solo si las monedas son distintas: monto que llega"),
      date: z.string().optional().describe("YYYY-MM-DD; omitir si fue hoy"),
    }),
    async run(db, userId, input, now) {
      const from = await findAccount(db, userId, input.from_account);
      const to = await findAccount(db, userId, input.to_account);
      const tx = await createTransaction(db, userId, {
        type: "TRANSFER",
        amount: positiveAmount(input.amount, from.currency),
        accountId: from.id,
        toAccountId: to.id,
        toAmount: input.received_amount ? positiveAmount(input.received_amount, to.currency) : null,
        date: parseDate(input.date, now),
      });
      const balances = await listAccounts(db, userId);
      const balanceOf = (id: string, currency: string) => formatMoney(balances.find((a) => a.id === id)?.balance ?? 0n, currency);
      return {
        recorded: "transferencia",
        amount: formatMoney(tx.amount, from.currency),
        from: from.name,
        to: to.name,
        newBalances: { [from.name]: balanceOf(from.id, from.currency), [to.name]: balanceOf(to.id, to.currency) },
      };
    },
  }),
  tool({
    name: "get_recent_movements",
    description: "Últimos movimientos registrados (los más recientes primero).",
    input: z.object({ limit: z.number().int().min(1).max(15).default(5) }),
    async run(db, userId, { limit }) {
      const items = await recentTransactions(db, userId, limit);
      return items.map((t) => ({
        date: toDateKey(t.date),
        type: t.type,
        amount: formatMoney(t.amount, t.account.currency),
        account: t.account.name,
        toAccount: t.toAccount?.name ?? null,
        category: t.category?.name ?? null,
        description: t.description,
      }));
    },
  }),
  tool({
    name: "undo_last_movement",
    description:
      "Deshace (envía a la papelera, recuperable 30 días) el último gasto, ingreso o transferencia registrado en las últimas 24 horas. " +
      "Úsala solo si el usuario pide deshacer o borrar lo último.",
    input: z.object({}),
    async run(db, userId, _input, now) {
      const last = await db.transaction.findFirst({
        where: {
          userId,
          deletedAt: null,
          type: { in: ["INCOME", "EXPENSE", "TRANSFER"] },
          goalContribution: null,
          createdAt: { gte: new Date(now.getTime() - 86_400_000) },
        },
        orderBy: { createdAt: "desc" },
        include: { account: { select: { name: true, currency: true } } },
      });
      if (!last) return { undone: false, reason: "No hay movimientos de las últimas 24 horas para deshacer." };
      await trashTransaction(db, userId, last.id);
      return {
        undone: true,
        type: last.type,
        amount: formatMoney(last.amount, last.account.currency),
        account: last.account.name,
        description: last.description,
      };
    },
  }),
];

// ---------------------------------------------------------------------------
// Ayudantes de las herramientas de escritura
// ---------------------------------------------------------------------------

/** Busca por nombre sin distinguir mayúsculas ni tildes; si no es exacto, acepta una coincidencia parcial única. */
function pickByName<T extends { name: string }>(items: T[], name: string, label: string): T {
  const exact = items.find((i) => sameName(i.name, name));
  if (exact) return exact;
  const fold = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
  const partial = items.filter((i) => fold(i.name).includes(fold(name)) || fold(name).includes(fold(i.name)));
  if (partial.length === 1) return partial[0];
  throw new DomainError(`No encontré la ${label} "${name}". Opciones: ${items.map((i) => i.name).join(", ") || "ninguna"}.`);
}

async function findAccount(db: Db, userId: string, name: string) {
  return pickByName(await listAccounts(db, userId), name, "cuenta");
}

function positiveAmount(text: string, currency: string): bigint {
  const amount = parseMoney(text, currency);
  if (amount <= 0n) throw new DomainError("El monto debe ser mayor a 0");
  return amount;
}

function parseDate(key: string | undefined, now: Date): Date {
  if (!key) return now;
  if (!isValidDateKey(key)) throw new DomainError(`Fecha inválida: ${key} (usa YYYY-MM-DD)`);
  if (key > toDateKey(now)) throw new DomainError("La fecha no puede ser futura");
  return dateKeyToInstant(key, now);
}

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

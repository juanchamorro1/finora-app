import type { DateRange } from "@/lib/dates";
import { monthKeysInRange, toDateKey, toMonthKey } from "@/lib/dates";
import { divRound } from "@/lib/money";
import type { Db, DbTx } from "../db-client";
import { getRateTable, toBase } from "./exchange-rates";

/**
 * Análisis financiero. Solo INCOME y EXPENSE son flujos reales: las
 * transferencias, saldos iniciales y ajustes NUNCA cuentan como ingreso o gasto.
 * Todos los montos se expresan en COP (las otras monedas se convierten con la
 * tasa manual; si falta la tasa, el movimiento se excluye y se informa).
 */

export interface Flow {
  id: string;
  type: "INCOME" | "EXPENSE";
  /** COP, siempre positivo. */
  amount: bigint;
  date: Date;
  description: string;
  accountId: string;
  category: { id: string; name: string; color: string; icon: string };
}

export interface FlowSet {
  flows: Flow[];
  /** Monedas cuyos movimientos se excluyeron por falta de tasa. */
  excludedCurrencies: string[];
}

export async function loadFlows(db: Db | DbTx, userId: string, range: DateRange): Promise<FlowSet> {
  const [rows, rates] = await Promise.all([
    db.transaction.findMany({
      where: { userId, deletedAt: null, type: { in: ["INCOME", "EXPENSE"] }, date: { gte: range.from, lt: range.to } },
      select: {
        id: true,
        type: true,
        amount: true,
        date: true,
        description: true,
        accountId: true,
        account: { select: { currency: true } },
        category: { select: { id: true, name: true, color: true, icon: true } },
      },
      orderBy: { date: "asc" },
    }),
    getRateTable(db, userId),
  ]);
  const flows: Flow[] = [];
  const excluded = new Set<string>();
  for (const r of rows) {
    const amount = toBase(r.amount, r.account.currency, rates);
    if (amount === null || !r.category) {
      excluded.add(r.account.currency);
      continue;
    }
    flows.push({
      id: r.id,
      type: r.type as Flow["type"],
      amount,
      date: r.date,
      description: r.description,
      accountId: r.accountId,
      category: r.category,
    });
  }
  return { flows, excludedCurrencies: [...excluded] };
}

// ---------------------------------------------------------------------------
// Agregaciones puras (sin BD): fáciles de probar y reutilizar.
// ---------------------------------------------------------------------------

export interface Totals {
  income: bigint;
  expense: bigint;
  /** income − expense (puede ser negativo). */
  net: bigint;
  incomeCount: number;
  expenseCount: number;
}

export function totals(flows: Flow[]): Totals {
  let income = 0n;
  let expense = 0n;
  let incomeCount = 0;
  let expenseCount = 0;
  for (const f of flows) {
    if (f.type === "INCOME") {
      income += f.amount;
      incomeCount++;
    } else {
      expense += f.amount;
      expenseCount++;
    }
  }
  return { income, expense, net: income - expense, incomeCount, expenseCount };
}

export interface CategoryTotal {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  total: bigint;
  count: number;
  /** Porcentaje del total del tipo (0-100, 1 decimal). */
  share: number;
}

export function byCategory(flows: Flow[], type: Flow["type"]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();
  let grand = 0n;
  for (const f of flows) {
    if (f.type !== type) continue;
    grand += f.amount;
    const entry = map.get(f.category.id) ?? {
      categoryId: f.category.id,
      name: f.category.name,
      color: f.category.color,
      icon: f.category.icon,
      total: 0n,
      count: 0,
      share: 0,
    };
    entry.total += f.amount;
    entry.count++;
    map.set(f.category.id, entry);
  }
  return [...map.values()]
    .map((e) => ({ ...e, share: grand === 0n ? 0 : Number(divRound(e.total * 1000n, grand)) / 10 }))
    .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));
}

export interface MonthPoint {
  /** "YYYY-MM" */
  month: string;
  income: bigint;
  expense: bigint;
  net: bigint;
  /** Ahorro acumulado (suma de net desde el inicio del rango). */
  cumulativeNet: bigint;
}

export function byMonth(flows: Flow[], range: DateRange): MonthPoint[] {
  const keys = monthKeysInRange(range);
  const map = new Map(keys.map((k) => [k, { income: 0n, expense: 0n }]));
  for (const f of flows) {
    const entry = map.get(toMonthKey(f.date));
    if (!entry) continue;
    if (f.type === "INCOME") entry.income += f.amount;
    else entry.expense += f.amount;
  }
  let cumulative = 0n;
  return keys.map((month) => {
    const { income, expense } = map.get(month)!;
    cumulative += income - expense;
    return { month, income, expense, net: income - expense, cumulativeNet: cumulative };
  });
}

export interface DayPoint {
  /** "YYYY-MM-DD" */
  day: string;
  expense: bigint;
}

export function expenseByDay(flows: Flow[]): DayPoint[] {
  const map = new Map<string, bigint>();
  for (const f of flows) {
    if (f.type !== "EXPENSE") continue;
    const key = toDateKey(f.date);
    map.set(key, (map.get(key) ?? 0n) + f.amount);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, expense]) => ({ day, expense }));
}

/**
 * Gasto diario promedio. Para el periodo en curso divide solo por los días
 * transcurridos (incluido hoy), no por la duración total del rango.
 */
export function dailyAverageExpense(flows: Flow[], range: DateRange, now: Date = new Date()): bigint {
  const effective = now < range.to && now >= range.from ? { from: range.from, to: now } : range;
  const days = BigInt(Math.max(1, Math.ceil((effective.to.getTime() - effective.from.getTime()) / 86_400_000)));
  return divRound(totals(flows).expense, days);
}

export function largestExpense(flows: Flow[]): Flow | null {
  let max: Flow | null = null;
  for (const f of flows) if (f.type === "EXPENSE" && (!max || f.amount > max.amount)) max = f;
  return max;
}


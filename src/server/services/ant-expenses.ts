import type { DateRange } from "@/lib/dates";
import { monthKeysInRange, toMonthKey } from "@/lib/dates";
import { divRound, percentOf } from "@/lib/money";
import { ANT_CATEGORY_NAME } from "./defaults";
import type { Flow } from "./analytics";

/**
 * Detección de POSIBLES gastos hormiga: gastos pequeños (≤ umbral) que se
 * repiten. No se juzga ningún gasto como "malo"; solo se señalan patrones para
 * que el usuario decida.
 *
 * Un patrón es un grupo de gastos pequeños con la misma descripción y categoría
 * que aparece al menos MIN_PATTERN_COUNT veces en el periodo. Además, todo gasto
 * en la categoría "Gastos hormiga" se considera parte del análisis aunque supere
 * el umbral (el usuario lo marcó así explícitamente).
 */

export const MIN_PATTERN_COUNT = 3;

export interface AntPattern {
  /** Descripción representativa (la más usada del grupo). */
  label: string;
  category: Flow["category"];
  count: number;
  total: bigint;
  average: bigint;
  /** Veces por semana en el periodo. */
  perWeek: number;
}

export interface AntAnalysis {
  threshold: bigint;
  count: number;
  total: bigint;
  /** % del gasto total del periodo. */
  shareOfExpenses: number;
  average: bigint;
  /** Proyección de 30 días al ritmo del periodo. */
  monthlyEstimate: bigint;
  /** Proyección anual (365 días) al ritmo del periodo. */
  yearlyEstimate: bigint;
  byCategory: { category: Flow["category"]; count: number; total: bigint }[];
  byMonth: { month: string; count: number; total: bigint }[];
  patterns: AntPattern[];
  items: Flow[];
}

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

export function isAntCandidate(flow: Flow, threshold: bigint): boolean {
  // Un aporte a una meta nunca es un gasto hormiga, aunque sea pequeño.
  if (flow.type !== "EXPENSE" || flow.savings) return false;
  return flow.amount <= threshold || flow.category.name === ANT_CATEGORY_NAME;
}

export function analyzeAntExpenses(
  flows: Flow[],
  threshold: bigint,
  range: DateRange,
  now: Date = new Date(),
): AntAnalysis {
  const items = flows.filter((f) => isAntCandidate(f, threshold));
  const totalExpenses = flows.filter((f) => f.type === "EXPENSE").reduce((s, f) => s + f.amount, 0n);
  const total = items.reduce((s, f) => s + f.amount, 0n);

  // Días efectivos: si el periodo está en curso, solo hasta hoy.
  const effective = now >= range.from && now < range.to ? { from: range.from, to: now } : range;
  const days = Math.max(1, Math.ceil((effective.to.getTime() - effective.from.getTime()) / 86_400_000));
  const daily = divRound(total, BigInt(days));

  const categories = new Map<string, { category: Flow["category"]; count: number; total: bigint }>();
  for (const f of items) {
    const e = categories.get(f.category.id) ?? { category: f.category, count: 0, total: 0n };
    e.count++;
    e.total += f.amount;
    categories.set(f.category.id, e);
  }

  const months = new Map(monthKeysInRange(range).map((m) => [m, { month: m, count: 0, total: 0n }]));
  for (const f of items) {
    const e = months.get(toMonthKey(f.date));
    if (e) {
      e.count++;
      e.total += f.amount;
    }
  }

  const groups = new Map<string, { labels: Map<string, number>; flows: Flow[] }>();
  for (const f of items) {
    const key = `${f.category.id}|${normalize(f.description)}`;
    const g = groups.get(key) ?? { labels: new Map<string, number>(), flows: [] as Flow[] };
    g.labels.set(f.description, (g.labels.get(f.description) ?? 0) + 1);
    g.flows.push(f);
    groups.set(key, g);
  }
  const weeks = Math.max(1, days / 7);
  const patterns: AntPattern[] = [...groups.values()]
    .filter((g) => g.flows.length >= MIN_PATTERN_COUNT)
    .map((g) => {
      const groupTotal = g.flows.reduce((s, f) => s + f.amount, 0n);
      const label = [...g.labels.entries()].sort((a, b) => b[1] - a[1])[0][0];
      return {
        label,
        category: g.flows[0].category,
        count: g.flows.length,
        total: groupTotal,
        average: divRound(groupTotal, BigInt(g.flows.length)),
        perWeek: Math.round((g.flows.length / weeks) * 10) / 10,
      };
    })
    .sort((a, b) => (b.total > a.total ? 1 : b.total < a.total ? -1 : 0));

  return {
    threshold,
    count: items.length,
    total,
    shareOfExpenses: percentOf(total, totalExpenses),
    average: items.length ? divRound(total, BigInt(items.length)) : 0n,
    monthlyEstimate: daily * 30n,
    yearlyEstimate: daily * 365n,
    byCategory: [...categories.values()].sort((a, b) => (b.total > a.total ? 1 : -1)),
    byMonth: [...months.values()],
    patterns,
    items: [...items].sort((a, b) => b.date.getTime() - a.date.getTime()),
  };
}


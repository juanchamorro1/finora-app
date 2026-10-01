import { percentOf } from "@/lib/money";
import type { Db, DbTx } from "../db-client";
import { assertDomain } from "../errors";
import type { Flow } from "./analytics";

/** Nivel de alerta: <75 % ok, ≥75 % atención, ≥90 % crítico, >100 % excedido. */
export type BudgetLevel = "ok" | "warning" | "critical" | "over";

export function budgetLevel(spent: bigint, limit: bigint): BudgetLevel {
  if (spent > limit) return "over";
  const pct = percentOf(spent, limit);
  if (pct >= 90) return "critical";
  if (pct >= 75) return "warning";
  return "ok";
}

export interface BudgetStatus {
  id: string;
  category: { id: string; name: string; icon: string; color: string; isArchived: boolean };
  /** Límite mensual (COP). */
  amount: bigint;
  spent: bigint;
  /** amount − spent (negativo si se excedió). */
  remaining: bigint;
  percent: number;
  level: BudgetLevel;
}

export interface BudgetSummary {
  budgets: BudgetStatus[];
  totalBudget: bigint;
  totalSpent: bigint;
  /** totalBudget − totalSpent: lo excedido en una categoría consume del resto (puede ser negativo). */
  totalRemaining: bigint;
  /** Cuántos presupuestos están excedidos. */
  overCount: number;
}

/** Estado de los presupuestos en un mes, a partir de los gastos ya cargados de ese rango. */
export function computeBudgetStatus(
  budgets: { id: string; amount: bigint; category: BudgetStatus["category"] }[],
  monthFlows: Flow[],
): BudgetSummary {
  const spentByCategory = new Map<string, bigint>();
  for (const f of monthFlows) {
    if (f.type !== "EXPENSE") continue;
    spentByCategory.set(f.category.id, (spentByCategory.get(f.category.id) ?? 0n) + f.amount);
  }
  const statuses = budgets.map((b) => {
    const spent = spentByCategory.get(b.category.id) ?? 0n;
    return {
      id: b.id,
      category: b.category,
      amount: b.amount,
      spent,
      remaining: b.amount - spent,
      percent: percentOf(spent, b.amount),
      level: budgetLevel(spent, b.amount),
    };
  });
  statuses.sort((a, b) => b.percent - a.percent);
  const totalBudget = statuses.reduce((s, b) => s + b.amount, 0n);
  const totalSpent = statuses.reduce((s, b) => s + b.spent, 0n);
  return {
    budgets: statuses,
    totalBudget,
    totalSpent,
    totalRemaining: totalBudget - totalSpent,
    overCount: statuses.filter((b) => b.level === "over").length,
  };
}

export async function listBudgets(db: Db | DbTx, userId: string) {
  return db.budget.findMany({
    where: { category: { userId } },
    include: { category: { select: { id: true, name: true, icon: true, color: true, isArchived: true } } },
    orderBy: { category: { sortOrder: "asc" } },
  });
}

export async function getBudgetSummary(db: Db | DbTx, userId: string, monthFlows: Flow[]): Promise<BudgetSummary> {
  return computeBudgetStatus(await listBudgets(db, userId), monthFlows);
}

/** Crea o actualiza el presupuesto mensual de una categoría de gasto. */
export async function setBudget(db: Db | DbTx, userId: string, categoryId: string, amount: bigint) {
  assertDomain(amount > 0n, "El presupuesto debe ser mayor a 0", "amount");
  const category = await db.category.findFirst({ where: { id: categoryId, userId } });
  assertDomain(category, "La categoría no existe", "categoryId");
  assertDomain(category.kind === "EXPENSE", "Solo se pueden presupuestar categorías de gasto", "categoryId");
  return db.budget.upsert({ where: { categoryId }, create: { categoryId, amount }, update: { amount } });
}

export async function deleteBudget(db: Db | DbTx, userId: string, id: string) {
  const budget = await db.budget.findFirst({ where: { id, category: { userId } } });
  assertDomain(budget, "El presupuesto no existe");
  await db.budget.delete({ where: { id } });
}


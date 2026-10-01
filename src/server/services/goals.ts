import { localParts, startOfDay } from "@/lib/dates";
import { divRound, percentOf } from "@/lib/money";
import { withTx, type Db, type DbTx } from "../db-client";
import { assertDomain } from "../errors";

export interface GoalInput {
  name: string;
  /** COP. */
  targetAmount: bigint;
  targetDate?: Date | null;
  accountId?: string | null;
  /** Monto ya ahorrado al crear la meta (se registra como primer aporte). */
  initialSaved?: bigint;
}

/** La cuenta asociada (opcional) debe ser del mismo usuario. */
async function assertOwnAccount(db: Db | DbTx, userId: string, accountId?: string | null) {
  if (!accountId) return;
  const account = await db.account.findFirst({ where: { id: accountId, userId } });
  assertDomain(account, "La cuenta no existe", "accountId");
}

async function getOwnGoal(db: Db | DbTx, userId: string, id: string) {
  const goal = await db.savingsGoal.findFirst({ where: { id, userId } });
  assertDomain(goal, "La meta no existe");
  return goal;
}

function validateGoal(input: GoalInput) {
  const name = input.name.trim();
  assertDomain(name.length > 0, "El nombre es obligatorio", "name");
  assertDomain(name.length <= 60, "Máximo 60 caracteres", "name");
  assertDomain(input.targetAmount > 0n, "El objetivo debe ser mayor a 0", "targetAmount");
  return name;
}

export async function createGoal(db: Db | DbTx, userId: string, input: GoalInput, now: Date = new Date()) {
  const name = validateGoal(input);
  const initial = input.initialSaved ?? 0n;
  assertDomain(initial >= 0n, "El monto ahorrado no puede ser negativo", "initialSaved");
  await assertOwnAccount(db, userId, input.accountId);
  return withTx(db, async (tx) => {
    const goal = await tx.savingsGoal.create({
      data: {
        userId,
        name,
        targetAmount: input.targetAmount,
        targetDate: input.targetDate ?? null,
        accountId: input.accountId || null,
        status: initial >= input.targetAmount ? "COMPLETED" : "ACTIVE",
        completedAt: initial >= input.targetAmount ? now : null,
      },
    });
    if (initial > 0n) {
      await tx.goalContribution.create({
        data: { goalId: goal.id, amount: initial, date: now, note: "Ahorro inicial" },
      });
    }
    return goal;
  });
}

export async function updateGoal(
  db: Db | DbTx,
  userId: string,
  id: string,
  input: Omit<GoalInput, "initialSaved">,
  now = new Date(),
) {
  const name = validateGoal(input);
  await assertOwnAccount(db, userId, input.accountId);
  return withTx(db, async (tx) => {
    const goal = await getOwnGoal(tx, userId, id);
    const saved = await savedAmount(tx, id);
    const reached = saved >= input.targetAmount;
    return tx.savingsGoal.update({
      where: { id },
      data: {
        name,
        targetAmount: input.targetAmount,
        targetDate: input.targetDate ?? null,
        accountId: input.accountId || null,
        ...(goal.status !== "ARCHIVED" && {
          status: reached ? "COMPLETED" : "ACTIVE",
          completedAt: reached ? (goal.completedAt ?? now) : null,
        }),
      },
    });
  });
}

async function savedAmount(db: Db | DbTx, goalId: string): Promise<bigint> {
  const agg = await db.goalContribution.aggregate({ where: { goalId }, _sum: { amount: true } });
  return agg._sum.amount ?? 0n;
}

/**
 * Aporta (monto > 0) o retira (monto < 0) dinero apartado para la meta.
 * No mueve saldos de cuentas: es dinero reservado. No se puede retirar más de lo ahorrado.
 */
export async function addContribution(
  db: Db | DbTx,
  userId: string,
  goalId: string,
  amount: bigint,
  opts: { date?: Date; note?: string | null } = {},
) {
  assertDomain(amount !== 0n, "El monto no puede ser 0", "amount");
  const note = opts.note?.trim() || null;
  assertDomain(!note || note.length <= 200, "Máximo 200 caracteres", "note");
  return withTx(db, async (tx) => {
    const goal = await getOwnGoal(tx, userId, goalId);
    assertDomain(goal.status !== "ARCHIVED", "La meta está archivada");
    const saved = await savedAmount(tx, goalId);
    assertDomain(saved + amount >= 0n, "No puedes retirar más de lo ahorrado en la meta", "amount");
    const now = opts.date ?? new Date();
    const contribution = await tx.goalContribution.create({ data: { goalId, amount, date: now, note } });
    const reached = saved + amount >= goal.targetAmount;
    if (reached !== (goal.status === "COMPLETED")) {
      await tx.savingsGoal.update({
        where: { id: goalId },
        data: { status: reached ? "COMPLETED" : "ACTIVE", completedAt: reached ? now : null },
      });
    }
    return { contribution, saved: saved + amount, completed: reached };
  });
}

export async function setGoalArchived(db: Db | DbTx, userId: string, id: string, archived: boolean) {
  return withTx(db, async (tx) => {
    const goal = await getOwnGoal(tx, userId, id);
    if (archived) return tx.savingsGoal.update({ where: { id }, data: { status: "ARCHIVED" } });
    const reached = (await savedAmount(tx, id)) >= goal.targetAmount;
    return tx.savingsGoal.update({ where: { id }, data: { status: reached ? "COMPLETED" : "ACTIVE" } });
  });
}

/** Elimina la meta y su historial de aportes (no afecta ninguna cuenta). */
export async function deleteGoal(db: Db | DbTx, userId: string, id: string) {
  await getOwnGoal(db, userId, id);
  await db.savingsGoal.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Progreso y proyección
// ---------------------------------------------------------------------------

export interface GoalProgress {
  id: string;
  name: string;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  targetAmount: bigint;
  saved: bigint;
  remaining: bigint;
  percent: number;
  targetDate: Date | null;
  account: { id: string; name: string } | null;
  /** Días hasta la fecha objetivo (negativo si ya pasó). */
  daysLeft: number | null;
  /** Ahorro necesario para llegar a tiempo (null sin fecha o ya completada). */
  requiredPerMonth: bigint | null;
  requiredPerWeek: bigint | null;
  /** Promedio aportado por mes en los últimos 90 días. */
  recentMonthlyPace: bigint;
  /** Fecha estimada de cumplimiento al ritmo reciente (null si el ritmo es 0). */
  projectedDate: Date | null;
  contributions: { id: string; amount: bigint; date: Date; note: string | null }[];
}

const DAY_MS = 86_400_000;

/** Meses de calendario restantes, contando el actual como parcial (mínimo 1). */
function monthsUntil(now: Date, target: Date): number {
  const a = localParts(now);
  const b = localParts(target);
  return Math.max(1, (b.year - a.year) * 12 + (b.month - a.month) + (b.day >= a.day ? 1 : 0));
}

export function computeGoalProgress(
  goal: {
    id: string;
    name: string;
    status: GoalProgress["status"];
    targetAmount: bigint;
    targetDate: Date | null;
    account: { id: string; name: string } | null;
    contributions: { id: string; amount: bigint; date: Date; note: string | null }[];
  },
  now: Date = new Date(),
): GoalProgress {
  const saved = goal.contributions.reduce((s, c) => s + c.amount, 0n);
  const remaining = goal.targetAmount > saved ? goal.targetAmount - saved : 0n;
  const today = startOfDay(now);
  const daysLeft = goal.targetDate ? Math.round((startOfDay(goal.targetDate).getTime() - today.getTime()) / DAY_MS) : null;

  let requiredPerMonth: bigint | null = null;
  let requiredPerWeek: bigint | null = null;
  if (goal.targetDate && remaining > 0n && daysLeft !== null && daysLeft > 0) {
    requiredPerMonth = divRound(remaining, BigInt(monthsUntil(now, goal.targetDate)));
    requiredPerWeek = divRound(remaining, BigInt(Math.max(1, Math.ceil(daysLeft / 7))));
  } else if (goal.targetDate && remaining > 0n) {
    // Fecha vencida: lo que falta, de una vez.
    requiredPerMonth = remaining;
    requiredPerWeek = remaining;
  }

  const since = new Date(now.getTime() - 90 * DAY_MS);
  const recent = goal.contributions.filter((c) => c.date >= since).reduce((s, c) => s + c.amount, 0n);
  const recentMonthlyPace = recent > 0n ? divRound(recent, 3n) : 0n;
  const projectedDate =
    remaining > 0n && recentMonthlyPace > 0n
      ? new Date(now.getTime() + Number(divRound(remaining * 30n, recentMonthlyPace)) * DAY_MS)
      : null;

  return {
    id: goal.id,
    name: goal.name,
    status: goal.status,
    targetAmount: goal.targetAmount,
    saved,
    remaining,
    percent: Math.min(100, percentOf(saved, goal.targetAmount)),
    targetDate: goal.targetDate,
    account: goal.account,
    daysLeft,
    requiredPerMonth,
    requiredPerWeek,
    recentMonthlyPace,
    projectedDate,
    contributions: [...goal.contributions].sort((a, b) => b.date.getTime() - a.date.getTime()),
  };
}

export async function listGoals(
  db: Db | DbTx,
  userId: string,
  opts: { includeArchived?: boolean; now?: Date } = {},
): Promise<GoalProgress[]> {
  const goals = await db.savingsGoal.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { status: { not: "ARCHIVED" } }) },
    include: {
      account: { select: { id: true, name: true } },
      contributions: { select: { id: true, amount: true, date: true, note: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  return goals.map((g) => computeGoalProgress(g, opts.now));
}

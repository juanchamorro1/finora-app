import type { AccountType } from "@/generated/prisma/enums";
import { withTx, type Db } from "../db-client";
import { DomainError, assertDomain } from "../errors";
import { createAccount } from "./accounts";
import { setBudget } from "./budgets";
import { ensureDefaultCategories } from "./categories";
import { createGoal } from "./goals";
import { isOnboardingCompleted, markOnboardingCompleted, setAntThreshold } from "./settings";

export const MAX_ONBOARDING_ACCOUNTS = 10;

export interface OnboardingInput {
  /** Cómo quiere que lo llamemos (vacío = no se cambia). */
  name?: string;
  /** Al menos una cuenta, con el saldo que tiene hoy. */
  accounts: { name: string; type: AccountType; currency: string; openingBalance: bigint }[];
  /** Límite mensual por categoría de gasto predeterminada (por nombre). */
  budgets?: { categoryName: string; amount: bigint }[];
  /** Desde qué monto (COP) un gasto se considera pequeño; null = valor por defecto. */
  antThreshold?: bigint | null;
  /** `accountIndex`: posición en `accounts` donde se guarda el ahorro (null = ninguna). */
  goal?: { name: string; targetAmount: bigint; targetDate: Date | null; initialSaved: bigint; accountIndex?: number | null } | null;
}

/** Re-lanza un error de dominio con el campo prefijado (ej. "accounts.1.name"). */
async function withField<T>(prefix: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DomainError) throw new DomainError(error.message, `${prefix}${error.field ?? ""}`);
    throw error;
  }
}

/**
 * Configuración inicial en una sola transacción: si algo falla no queda nada a medias.
 * Las categorías predeterminadas se crean todas; se editan después en Ajustes.
 */
export async function completeOnboarding(db: Db, userId: string, input: OnboardingInput) {
  assertDomain(!(await isOnboardingCompleted(db, userId)), "La configuración inicial ya se completó");
  assertDomain(input.accounts.length > 0, "Agrega al menos una cuenta", "accounts");
  assertDomain(input.accounts.length <= MAX_ONBOARDING_ACCOUNTS, `Máximo ${MAX_ONBOARDING_ACCOUNTS} cuentas`, "accounts");
  const name = input.name?.trim() ?? "";
  assertDomain(name.length <= 40, "Máximo 40 caracteres", "name");
  const goalIndex = input.goal?.accountIndex ?? null;
  assertDomain(goalIndex === null || (goalIndex >= 0 && goalIndex < input.accounts.length), "La cuenta no existe", "goal.accountIndex");

  return withTx(db, async (tx) => {
    await ensureDefaultCategories(tx, userId);
    if (name) await tx.user.update({ where: { id: userId }, data: { name } });

    const accountIds: string[] = [];
    for (const [i, account] of input.accounts.entries()) {
      const created = await withField(`accounts.${i}.`, () => createAccount(tx, userId, account));
      accountIds.push(created.id);
    }

    for (const [i, budget] of (input.budgets ?? []).entries()) {
      if (budget.amount === 0n) continue;
      const category = await tx.category.findFirst({ where: { userId, name: budget.categoryName, kind: "EXPENSE" } });
      assertDomain(category, `La categoría "${budget.categoryName}" no existe`, `budgets.${i}.amount`);
      await withField(`budgets.${i}.`, () => setBudget(tx, userId, category.id, budget.amount));
    }

    if (input.antThreshold != null) {
      assertDomain(input.antThreshold > 0n, "Debe ser mayor a 0", "antThreshold");
      await setAntThreshold(tx, userId, input.antThreshold);
    }

    if (input.goal) {
      const { accountIndex, ...goal } = input.goal;
      await withField("goal.", () =>
        createGoal(tx, userId, { ...goal, accountId: accountIndex == null ? null : accountIds[accountIndex] }),
      );
    }
    await markOnboardingCompleted(tx, userId);
    return { accountIds };
  });
}

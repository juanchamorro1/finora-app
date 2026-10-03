import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db-client";
import { createTestDb } from "./test-db";
import { completeOnboarding } from "../services/onboarding";
import { DEFAULT_CATEGORIES } from "../services/defaults";
import { getAntThreshold, isOnboardingCompleted } from "../services/settings";
import { computeBalance } from "../services/ledger";
import { searchTransactions } from "../services/transactions";

describe("configuración inicial", () => {
  let db: Db;
  let uid: string;
  let cleanup: () => Promise<void>;
  beforeEach(async () => ({ db, cleanup, userId: uid } = await createTestDb()));
  afterEach(() => cleanup());

  const base = {
    accounts: [
      { name: "Nequi", type: "DIGITAL_WALLET" as const, currency: "COP", openingBalance: 250_000n },
      { name: "Binance", type: "CRYPTO" as const, currency: "USDT", openingBalance: 1_500n },
    ],
  };

  it("crea cuentas, categorías, presupuestos, umbral y meta en una sola operación", async () => {
    expect(await isOnboardingCompleted(db, uid)).toBe(false);
    const { accountIds } = await completeOnboarding(db, uid, {
      ...base,
      name: "  Juanito ",
      budgets: [
        { categoryName: "Comida", amount: 400_000n },
        { categoryName: "Transporte", amount: 0n }, // en blanco: se ignora
      ],
      antThreshold: 20_000n,
      goal: { name: "PC nueva", targetAmount: 2_000_000n, targetDate: new Date("2027-12-31T17:00:00Z"), initialSaved: 350_000n, accountIndex: 0 },
    });
    expect(await isOnboardingCompleted(db, uid)).toBe(true);
    expect(await computeBalance(db, uid, accountIds[0])).toBe(250_000n);
    expect(await computeBalance(db, uid, accountIds[1])).toBe(1_500n);
    expect((await db.user.findUniqueOrThrow({ where: { id: uid } })).name).toBe("Juanito");
    expect(await db.category.count({ where: { userId: uid } })).toBe(DEFAULT_CATEGORIES.length);
    const budgets = await db.budget.findMany({ include: { category: true } });
    expect(budgets.map((b) => [b.category.name, b.amount])).toEqual([["Comida", 400_000n]]);
    expect(await getAntThreshold(db, uid)).toBe(20_000n);
    const goal = await db.savingsGoal.findFirstOrThrow({ include: { contributions: true } });
    expect(goal.accountId).toBe(accountIds[0]);
    expect(goal.contributions[0].amount).toBe(350_000n);
    // En la lista de movimientos el saldo inicial tiene su propio tipo (no aparece filtrando ingresos).
    expect((await searchTransactions(db, uid, { type: "INCOME" })).total).toBe(0);
  });

  it("no deja datos a medias si algo falla, y señala la cuenta con error", async () => {
    await expect(
      completeOnboarding(db, uid, { accounts: [base.accounts[0], { ...base.accounts[1], name: "nequi" }] }),
    ).rejects.toMatchObject({ field: "accounts.1.name" });
    expect(await db.category.count()).toBe(0);
    expect(await db.account.count()).toBe(0);
    expect(await isOnboardingCompleted(db, uid)).toBe(false);
  });

  it("exige al menos una cuenta y no se repite", async () => {
    await expect(completeOnboarding(db, uid, { accounts: [] })).rejects.toThrow(/al menos una cuenta/);
    await completeOnboarding(db, uid, base);
    expect(await getAntThreshold(db, uid)).toBe(10_000n); // valor por defecto
    await expect(completeOnboarding(db, uid, base)).rejects.toThrow(/ya se completó/);
  });
});

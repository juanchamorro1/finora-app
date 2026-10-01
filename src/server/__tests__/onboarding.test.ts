import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db-client";
import { createTestDb } from "./test-db";
import { completeOnboarding } from "../services/onboarding";
import { isOnboardingCompleted } from "../services/settings";
import { computeBalance } from "../services/ledger";
import { searchTransactions } from "../services/transactions";

describe("configuración inicial", () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  beforeEach(async () => ({ db, cleanup } = await createTestDb()));
  afterEach(() => cleanup());

  const base = {
    account: { name: "Nequi", type: "DIGITAL_WALLET" as const, currency: "COP", openingBalance: 250_000n },
    defaultCategories: [
      { name: "Comida", kind: "EXPENSE" as const },
      { name: "Trabajo", kind: "INCOME" as const },
    ],
    customCategories: [
      { name: "Mascotas", kind: "EXPENSE" as const },
      // Duplicados que deben ignorarse:
      { name: "comida", kind: "EXPENSE" as const },
      { name: "MASCOTAS", kind: "EXPENSE" as const },
    ],
  };

  it("crea cuenta, categorías y meta en una sola operación", async () => {
    expect(await isOnboardingCompleted(db)).toBe(false);
    const { accountId } = await completeOnboarding(db, {
      ...base,
      goal: { name: "PC nueva", targetAmount: 2_000_000n, targetDate: new Date("2027-12-31T17:00:00Z"), initialSaved: 350_000n },
    });
    expect(await isOnboardingCompleted(db)).toBe(true);
    expect(await computeBalance(db, accountId)).toBe(250_000n);
    expect((await db.category.findMany()).map((c) => c.name).sort()).toEqual(["Comida", "Mascotas", "Trabajo"]);
    const goal = await db.savingsGoal.findFirstOrThrow({ include: { contributions: true } });
    expect(goal.contributions[0].amount).toBe(350_000n);
    // El saldo inicial no es un ingreso.
    expect((await searchTransactions(db, { type: "INCOME" })).total).toBe(0);
  });

  it("no deja datos a medias si algo falla", async () => {
    await expect(
      completeOnboarding(db, { ...base, account: { ...base.account, name: "   " } }),
    ).rejects.toThrow(/nombre/);
    expect(await db.category.count()).toBe(0);
    expect(await isOnboardingCompleted(db)).toBe(false);
  });

  it("exige categorías de ingreso y gasto, y no se repite", async () => {
    await expect(
      completeOnboarding(db, { ...base, defaultCategories: [], customCategories: [] }),
    ).rejects.toThrow(/categoría de gasto/);
    await completeOnboarding(db, base);
    await expect(completeOnboarding(db, base)).rejects.toThrow(/ya se completó/);
  });
});

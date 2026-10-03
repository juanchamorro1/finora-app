import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db-client";
import { createTestDb, createTestUser } from "./test-db";
import { createAccount, deleteAccount, getNetWorth, listAccounts, setOpeningBalance, updateAccount } from "../services/accounts";
import { createCategory, ensureDefaultCategories, listCategories, updateCategory } from "../services/categories";
import { createTransaction, searchTransactions, trashTransaction, updateTransaction } from "../services/transactions";
import { setBudget, listBudgets, deleteBudget } from "../services/budgets";
import { addContribution, createGoal, deleteGoal, listGoals } from "../services/goals";
import { getDashboard } from "../services/dashboard";
import { runAssistantTool } from "../assistant/tools";
import { setExchangeRate, getRateTable } from "../services/exchange-rates";
import { getAntThreshold, setAntThreshold, isOnboardingCompleted, markOnboardingCompleted } from "../services/settings";

/**
 * Privacidad entre usuarios: cada persona solo puede ver y modificar sus datos,
 * aunque conozca los ids de los registros de la otra.
 */
describe("aislamiento entre usuarios", () => {
  let db: Db;
  let cleanup: () => Promise<void>;
  let juan: string;
  let mama: string;
  let juanAccount: string;
  let juanCategory: string;
  let juanTx: string;
  let juanGoal: string;
  let juanBudget: string;
  let mamaAccount: string;
  let mamaCategory: string;

  beforeEach(async () => {
    ({ db, cleanup, userId: juan } = await createTestDb());
    mama = await createTestUser(db, "mama");
    await ensureDefaultCategories(db, juan);
    await ensureDefaultCategories(db, mama);
    juanAccount = (await createAccount(db, juan, { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP", openingBalance: 500_000n })).id;
    mamaAccount = (await createAccount(db, mama, { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP", openingBalance: 80_000n })).id;
    juanCategory = (await db.category.findFirstOrThrow({ where: { userId: juan, name: "Comida", kind: "EXPENSE" } })).id;
    mamaCategory = (await db.category.findFirstOrThrow({ where: { userId: mama, name: "Comida", kind: "EXPENSE" } })).id;
    juanTx = (await createTransaction(db, juan, { type: "EXPENSE", amount: 20_000n, accountId: juanAccount, categoryId: juanCategory, date: new Date() })).id;
    juanGoal = (await createGoal(db, juan, { name: "PC", targetAmount: 1_000_000n, initialSaved: 100_000n })).id;
    juanBudget = (await setBudget(db, juan, juanCategory, 200_000n)).id;
  });
  afterEach(() => cleanup());

  it("cada uno ve solo sus cuentas, movimientos, metas y presupuestos", async () => {
    expect((await listAccounts(db, mama)).map((a) => a.id)).toEqual([mamaAccount]);
    expect((await getNetWorth(db, mama)).totalBase).toBe(80_000n);
    expect((await getNetWorth(db, juan)).totalBase).toBe(480_000n);
    expect((await searchTransactions(db, mama, {})).items.every((t) => t.account.id === mamaAccount)).toBe(true);
    expect(await listGoals(db, mama)).toEqual([]);
    expect(await listBudgets(db, mama)).toEqual([]);
    expect((await listCategories(db, mama)).every((c) => c.userId === mama)).toBe(true);
    const dash = await getDashboard(db, mama);
    expect(dash.recent.map((t) => t.account.id)).toEqual([mamaAccount]);
    expect(dash.goals).toEqual([]);
  });

  it("los nombres pueden repetirse entre usuarios", async () => {
    // Ambos tienen "Nequi" y "Comida" sin conflicto.
    await expect(createCategory(db, mama, { name: "Mascotas", kind: "EXPENSE" })).resolves.toBeTruthy();
    await expect(createCategory(db, juan, { name: "Mascotas", kind: "EXPENSE" })).resolves.toBeTruthy();
  });

  it("no puede usar cuentas ni categorías de otro usuario en sus movimientos", async () => {
    await expect(
      createTransaction(db, mama, { type: "EXPENSE", amount: 1_000n, accountId: juanAccount, categoryId: mamaCategory, date: new Date() }),
    ).rejects.toThrow(/cuenta no existe/);
    await expect(
      createTransaction(db, mama, { type: "EXPENSE", amount: 1_000n, accountId: mamaAccount, categoryId: juanCategory, date: new Date() }),
    ).rejects.toThrow(/categoría no existe/);
    await expect(
      createTransaction(db, mama, { type: "TRANSFER", amount: 1_000n, accountId: mamaAccount, toAccountId: juanAccount, date: new Date() }),
    ).rejects.toThrow(/destino no existe/);
  });

  it("no puede modificar ni borrar datos de otro usuario aunque conozca los ids", async () => {
    await expect(updateTransaction(db, mama, juanTx, { type: "EXPENSE", amount: 1n, accountId: mamaAccount, categoryId: mamaCategory, date: new Date() })).rejects.toThrow(/no existe/);
    await expect(trashTransaction(db, mama, juanTx)).rejects.toThrow(/no existe/);
    await expect(updateAccount(db, mama, juanAccount, { name: "Robada", type: "CASH", currency: "COP" })).rejects.toThrow(/no existe/);
    await expect(setOpeningBalance(db, mama, juanAccount, 1n)).rejects.toThrow(/no existe/);
    await expect(deleteAccount(db, mama, juanAccount)).rejects.toThrow(/no existe/);
    await expect(updateCategory(db, mama, juanCategory, { name: "X" })).rejects.toThrow(/no existe/);
    await expect(setBudget(db, mama, juanCategory, 1n)).rejects.toThrow(/no existe/);
    await expect(deleteBudget(db, mama, juanBudget)).rejects.toThrow(/no existe/);
    await expect(addContribution(db, mama, juanGoal, 5_000n)).rejects.toThrow(/no existe/);
    await expect(deleteGoal(db, mama, juanGoal)).rejects.toThrow(/no existe/);
    await expect(createGoal(db, mama, { name: "Viaje", targetAmount: 1n, accountId: juanAccount })).rejects.toThrow(/no existe/);
    // Los datos de Juan siguen intactos.
    expect((await getNetWorth(db, juan)).totalBase).toBe(480_000n);
    expect((await listGoals(db, juan))[0].saved).toBe(100_000n);
  });

  it("ajustes, tasas y configuración inicial son por usuario", async () => {
    await setAntThreshold(db, juan, 3_000n);
    expect(await getAntThreshold(db, mama)).toBe(10_000n);
    await setExchangeRate(db, juan, "USD", 4_000_000_000n);
    expect((await getRateTable(db, mama)).has("USD")).toBe(false);
    await markOnboardingCompleted(db, juan);
    expect(await isOnboardingCompleted(db, mama)).toBe(false);
  });

  it("el asistente solo responde con los datos del usuario", async () => {
    expect(await runAssistantTool(db, mama, "get_net_worth", {})).toMatchObject({ totalCOP: "$80.000" });
    expect(await runAssistantTool(db, mama, "get_goals_progress", {})).toEqual([]);
  });
});

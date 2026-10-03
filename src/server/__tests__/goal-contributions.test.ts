import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db-client";
import { createTestDb, createTestUser } from "./test-db";
import { monthRange } from "@/lib/dates";
import { createAccount } from "../services/accounts";
import { loadFlows, totals } from "../services/analytics";
import { analyzeAntExpenses } from "../services/ant-expenses";
import { ensureDefaultCategories } from "../services/categories";
import { addContribution, createGoal, deleteGoal, listGoals } from "../services/goals";
import { computeBalance } from "../services/ledger";
import { createTransaction, trashTransaction, updateTransaction } from "../services/transactions";

const at = (iso: string) => new Date(`${iso}T17:00:00Z`);

describe("aportes a metas desde una cuenta", () => {
  let db: Db;
  let uid: string;
  let cleanup: () => Promise<void>;
  let bancolombia: string;
  let goal: string;

  beforeEach(async () => {
    ({ db, cleanup, userId: uid } = await createTestDb());
    await ensureDefaultCategories(db, uid);
    bancolombia = (await createAccount(db, uid, { name: "Bancolombia", type: "BANK", currency: "COP", openingBalance: 300_000n, openingDate: at("2026-08-01") })).id;
    goal = (await createGoal(db, uid, { name: "PC nueva", targetAmount: 1_000_000n, accountId: bancolombia })).id;
  });
  afterEach(() => cleanup());

  it("el aporte sale de la cuenta, cuenta como gasto y no baja el ahorro del mes", async () => {
    await addContribution(db, uid, goal, 100_000n, { accountId: bancolombia, date: at("2026-09-10") });
    expect(await computeBalance(db, uid, bancolombia)).toBe(200_000n);
    const [g] = await listGoals(db, uid);
    expect(g.saved).toBe(100_000n);

    const tx = await db.transaction.findFirstOrThrow({ where: { type: "EXPENSE" }, include: { category: true } });
    expect(tx).toMatchObject({ amount: 100_000n, description: "Aporte a PC nueva" });
    expect(tx.category?.name).toBe("Ahorro para metas");

    const t = totals((await loadFlows(db, uid, monthRange(2026, 9))).flows);
    expect(t.expense).toBe(100_000n);
    expect(t.saved).toBe(100_000n);
    expect(t.savings).toBe(0n); // ahorrar no es "gastar" el ahorro del mes
  });

  it("no deja aportar más de lo que hay en la cuenta ni desde cuentas en otra moneda", async () => {
    await expect(addContribution(db, uid, goal, 400_000n, { accountId: bancolombia })).rejects.toThrow(/No tienes suficiente en Bancolombia/);
    const usd = (await createAccount(db, uid, { name: "Wise", type: "BANK", currency: "USD", openingBalance: 10_000n })).id;
    await expect(addContribution(db, uid, goal, 1_000n, { accountId: usd })).rejects.toThrow(/pesos/);
    expect(await db.goalContribution.count()).toBe(0);
    expect(await db.transaction.count({ where: { type: "EXPENSE" } })).toBe(0);
  });

  it("sin cuenta es dinero que ya estaba aparte: no mueve saldos", async () => {
    await addContribution(db, uid, goal, 50_000n);
    expect(await computeBalance(db, uid, bancolombia)).toBe(300_000n);
    expect((await listGoals(db, uid))[0].saved).toBe(50_000n);
  });

  it("el retiro vuelve a la cuenta como ingreso", async () => {
    await addContribution(db, uid, goal, 100_000n, { accountId: bancolombia, date: at("2026-09-10") });
    await addContribution(db, uid, goal, -40_000n, { accountId: bancolombia, date: at("2026-09-12") });
    expect(await computeBalance(db, uid, bancolombia)).toBe(240_000n);
    expect((await listGoals(db, uid))[0].saved).toBe(60_000n);
    const t = totals((await loadFlows(db, uid, monthRange(2026, 9))).flows);
    expect(t.saved).toBe(60_000n);
    expect(t.savings).toBe(0n);
  });

  it("los movimientos de una meta solo se gestionan desde Metas", async () => {
    await addContribution(db, uid, goal, 100_000n, { accountId: bancolombia });
    const tx = await db.transaction.findFirstOrThrow({ where: { type: "EXPENSE" } });
    await expect(trashTransaction(db, uid, tx.id)).rejects.toThrow(/desde Metas/);
    await expect(
      updateTransaction(db, uid, tx.id, { type: "EXPENSE", amount: 1n, accountId: bancolombia, categoryId: tx.categoryId, date: new Date() }),
    ).rejects.toThrow(/desde Metas/);
    // Tampoco se puede usar la categoría a mano.
    await expect(
      createTransaction(db, uid, { type: "EXPENSE", amount: 1_000n, accountId: bancolombia, categoryId: tx.categoryId, date: new Date() }),
    ).rejects.toThrow(/aportes a metas/);
  });

  it("eliminar la meta devuelve a la cuenta lo aportado desde ella", async () => {
    await addContribution(db, uid, goal, 100_000n, { accountId: bancolombia });
    await addContribution(db, uid, goal, 20_000n);
    expect(await deleteGoal(db, uid, goal)).toEqual({ returnedMovements: 1 });
    expect(await computeBalance(db, uid, bancolombia)).toBe(300_000n);
    expect(await db.goalContribution.count()).toBe(0);
  });

  it("un aporte pequeño no es un gasto hormiga", async () => {
    for (const day of ["2026-09-03", "2026-09-10", "2026-09-17"]) {
      await addContribution(db, uid, goal, 5_000n, { accountId: bancolombia, date: at(day) });
    }
    const range = monthRange(2026, 9);
    const report = analyzeAntExpenses((await loadFlows(db, uid, range)).flows, 10_000n, range);
    expect(report.total).toBe(0n);
  });

  it("no se puede aportar desde la cuenta de otro usuario", async () => {
    const mama = await createTestUser(db, "mama");
    const mamaAccount = (await createAccount(db, mama, { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP", openingBalance: 500_000n })).id;
    await expect(addContribution(db, uid, goal, 1_000n, { accountId: mamaAccount })).rejects.toThrow(/no existe/);
    expect(await computeBalance(db, mama, mamaAccount)).toBe(500_000n);
  });
});

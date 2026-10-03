import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db-client";
import { createTestDb } from "./test-db";
import { monthRange } from "@/lib/dates";
import { ensureDefaultCategories } from "../services/categories";
import { createAccount } from "../services/accounts";
import { createTransaction } from "../services/transactions";
import { byCategory, byMonth, dailyAverageExpense, largestExpense, loadFlows, totals } from "../services/analytics";
import { budgetLevel, getBudgetSummary, setBudget } from "../services/budgets";
import { addContribution, computeGoalProgress, createGoal, listGoals } from "../services/goals";
import { setExchangeRate } from "../services/exchange-rates";
import { getDashboard } from "../services/dashboard";

const at = (iso: string) => new Date(`${iso}T17:00:00Z`); // mediodía en Bogotá

describe("análisis financiero", () => {
  let db: Db;
  let uid: string;
  let cleanup: () => Promise<void>;
  let bank: string;
  let nequi: string;
  let cat: Record<string, string>;

  beforeEach(async () => {
    ({ db, cleanup, userId: uid } = await createTestDb());
    await ensureDefaultCategories(db, uid);
    bank = (await createAccount(db, uid, { name: "Bancolombia", type: "BANK", currency: "COP", openingBalance: 1_000_000n, openingDate: at("2026-09-01") })).id;
    nequi = (await createAccount(db, uid, { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP", openingBalance: 0n })).id;
    cat = Object.fromEntries((await db.category.findMany()).map((c) => [`${c.kind}:${c.name}`, c.id]));
    const tx = (type: "INCOME" | "EXPENSE", amount: bigint, category: string, date: string, accountId = bank) =>
      createTransaction(db, uid, { type, amount, accountId, categoryId: cat[`${type}:${category}`], date: at(date) });

    await tx("INCOME", 900_000n, "Trabajo", "2026-08-05");
    await tx("EXPENSE", 200_000n, "Comida", "2026-08-10");
    await tx("INCOME", 1_000_000n, "Trabajo", "2026-09-05");
    await tx("EXPENSE", 120_000n, "Comida", "2026-09-06");
    await tx("EXPENSE", 8_000n, "Comida", "2026-09-07", nequi);
    await tx("EXPENSE", 45_000n, "Entretenimiento", "2026-09-12");
    await createTransaction(db, uid, { type: "TRANSFER", amount: 300_000n, accountId: bank, toAccountId: nequi, date: at("2026-09-08") });
  });
  afterEach(() => cleanup());

  it("el saldo inicial cuenta como ingreso; las transferencias no son ingresos ni gastos", async () => {
    const { flows } = await loadFlows(db, uid, monthRange(2026, 9));
    const t = totals(flows);
    expect(t.income).toBe(2_000_000n); // 1.000.000 de trabajo + 1.000.000 de saldo inicial
    expect(t.expense).toBe(173_000n);
    expect(t.net).toBe(1_827_000n);
    expect(byCategory(flows, "INCOME").map((c) => [c.name, c.total])).toEqual([
      ["Saldo inicial", 1_000_000n],
      ["Trabajo", 1_000_000n],
    ]);
  });

  it("un saldo inicial negativo (deuda) no cuenta como gasto", async () => {
    await createAccount(db, uid, { name: "Tarjeta", type: "OTHER", currency: "COP", openingBalance: -500_000n, openingDate: at("2026-09-02") });
    const t = totals((await loadFlows(db, uid, monthRange(2026, 9))).flows);
    expect(t.expense).toBe(173_000n);
    expect(t.income).toBe(2_000_000n);
  });

  it("agrupa por categoría y mes", async () => {
    const range = { from: monthRange(2026, 8).from, to: monthRange(2026, 9).to };
    const { flows } = await loadFlows(db, uid, range);
    const cats = byCategory(flows, "EXPENSE");
    expect(cats[0]).toMatchObject({ name: "Comida", total: 328_000n, count: 3 });
    expect(cats[0].share).toBe(87.9);
    const months = byMonth(flows, range);
    expect(months.map((m) => [m.month, m.net, m.cumulativeNet])).toEqual([
      ["2026-08", 700_000n, 700_000n],
      ["2026-09", 1_827_000n, 2_527_000n],
    ]);
    expect(largestExpense(flows)?.amount).toBe(200_000n);
  });

  it("promedio diario usa solo los días transcurridos del mes en curso", async () => {
    const range = monthRange(2026, 9);
    const { flows } = await loadFlows(db, uid, range);
    // 10 de septiembre a mediodía → 10 días.
    expect(dailyAverageExpense(flows, range, at("2026-09-10"))).toBe(17_300n);
    // Mes cerrado → 30 días.
    expect(dailyAverageExpense(flows, range, at("2026-10-15"))).toBe(5_767n);
  });

  it("convierte otras monedas y excluye las que no tienen tasa", async () => {
    const usd = (await createAccount(db, uid, { name: "Wise", type: "BANK", currency: "USD", openingBalance: 0n })).id;
    await createTransaction(db, uid, { type: "EXPENSE", amount: 1_000n, accountId: usd, categoryId: cat["EXPENSE:Suscripciones"], date: at("2026-09-15") });
    let result = await loadFlows(db, uid, monthRange(2026, 9));
    expect(result.excludedCurrencies).toEqual(["USD"]);
    await setExchangeRate(db, uid, "USD", 4_000_000_000n);
    result = await loadFlows(db, uid, monthRange(2026, 9));
    expect(result.excludedCurrencies).toEqual([]);
    expect(totals(result.flows).expense).toBe(173_000n + 40_000n);
  });

  it("presupuestos con alertas de 75 %, 90 % y excedido", async () => {
    expect(budgetLevel(74n, 100n)).toBe("ok");
    expect(budgetLevel(75n, 100n)).toBe("warning");
    expect(budgetLevel(90n, 100n)).toBe("critical");
    expect(budgetLevel(100n, 100n)).toBe("critical");
    expect(budgetLevel(101n, 100n)).toBe("over");

    await setBudget(db, uid, cat["EXPENSE:Comida"], 150_000n);
    await setBudget(db, uid, cat["EXPENSE:Entretenimiento"], 40_000n);
    await expect(setBudget(db, uid, cat["INCOME:Trabajo"], 1n)).rejects.toThrow(/gasto/);
    const { flows } = await loadFlows(db, uid, monthRange(2026, 9));
    const summary = await getBudgetSummary(db, uid, flows);
    const byName = Object.fromEntries(summary.budgets.map((b) => [b.category.name, b]));
    expect(byName.Comida).toMatchObject({ spent: 128_000n, remaining: 22_000n, level: "warning", percent: 85.3 });
    expect(byName.Entretenimiento).toMatchObject({ spent: 45_000n, remaining: -5_000n, level: "over" });
    // (150.000 + 40.000) − (128.000 + 45.000): lo excedido consume del total.
    expect(summary.totalRemaining).toBe(17_000n);
    expect(summary.overCount).toBe(1);
  });

  it("metas: progreso, ritmo necesario y aportes", async () => {
    const now = at("2026-09-30");
    const goal = await createGoal(db, uid, { name: "PC nueva", targetAmount: 2_000_000n, targetDate: at("2027-12-31"), initialSaved: 350_000n }, now);
    let [progress] = await listGoals(db, uid, { now });
    expect(progress.percent).toBe(17.5);
    expect(progress.remaining).toBe(1_650_000n);
    // Sep 2026 → Dic 2027 = 16 meses (incluye el actual).
    expect(progress.requiredPerMonth).toBe(103_125n);
    expect(progress.daysLeft).toBe(457);

    await expect(addContribution(db, uid, goal.id, -400_000n)).rejects.toThrow(/retirar/);
    const result = await addContribution(db, uid, goal.id, 1_650_000n, { date: now });
    expect(result.completed).toBe(true);
    [progress] = await listGoals(db, uid, { now });
    expect(progress).toMatchObject({ status: "COMPLETED", percent: 100, remaining: 0n, requiredPerMonth: null });
    await addContribution(db, uid, goal.id, -100_000n, { date: now });
    [progress] = await listGoals(db, uid, { now });
    expect(progress.status).toBe("ACTIVE");
  });

  it("proyecta la fecha al ritmo reciente", () => {
    const now = at("2026-09-30");
    const progress = computeGoalProgress(
      {
        id: "g", name: "Viaje", status: "ACTIVE", targetAmount: 600_000n, targetDate: null, account: null,
        contributions: [
          { id: "1", amount: 100_000n, date: at("2026-08-01"), note: null },
          { id: "2", amount: 200_000n, date: at("2026-09-01"), note: null },
        ],
      },
      now,
    );
    expect(progress.recentMonthlyPace).toBe(100_000n);
    expect(progress.requiredPerMonth).toBeNull();
    // Faltan 300.000 a 100.000/mes → ~90 días.
    expect(Math.round((progress.projectedDate!.getTime() - now.getTime()) / 86_400_000)).toBe(90);
  });

  it("dashboard combina todo", async () => {
    const d = await getDashboard(db, uid, at("2026-09-20"));
    expect(d.netWorth.totalBase).toBe(1_000_000n + 1_900_000n - 373_000n);
    expect(d.month).toMatchObject({ income: 2_000_000n, expense: 173_000n, net: 1_827_000n });
    expect(d.chart).toHaveLength(6);
    expect(d.chart.at(-1)?.month).toBe("2026-09");
    expect(d.recent[0].type).toBe("EXPENSE");
  });
});

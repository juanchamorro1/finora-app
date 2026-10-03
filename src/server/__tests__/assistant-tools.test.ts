import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db-client";
import { createTestDb } from "./test-db";
import { assistantToolDefinitions, runAssistantTool } from "../assistant/tools";
import { ensureDefaultCategories } from "../services/categories";
import { createAccount } from "../services/accounts";
import { createTransaction } from "../services/transactions";
import { setBudget } from "../services/budgets";
import { createGoal } from "../services/goals";

const at = (iso: string) => new Date(`${iso}T17:00:00Z`);

describe("herramientas del asistente", () => {
  let db: Db;
  let uid: string;
  let cleanup: () => Promise<void>;
  const now = at("2026-09-23"); // miércoles

  beforeEach(async () => {
    ({ db, cleanup, userId: uid } = await createTestDb());
    await ensureDefaultCategories(db, uid);
    const bank = (await createAccount(db, uid, { name: "Banco", type: "BANK", currency: "COP", openingBalance: 500_000n, openingDate: at("2026-09-01") })).id;
    const comida = (await db.category.findFirstOrThrow({ where: { name: "Comida", kind: "EXPENSE" } })).id;
    await createTransaction(db, uid, { type: "EXPENSE", amount: 120_000n, accountId: bank, categoryId: comida, date: at("2026-09-10") });
    await createTransaction(db, uid, { type: "EXPENSE", amount: 3_000n, accountId: bank, categoryId: comida, date: at("2026-09-11"), description: "Tinto" });
    await setBudget(db, uid, comida, 300_000n);
    await createGoal(db, uid, { name: "PC nueva", targetAmount: 2_000_000n, initialSaved: 350_000n, targetDate: at("2027-12-31") }, now);
  });
  afterEach(() => cleanup());

  it("expone definiciones con JSON Schema", () => {
    const defs = assistantToolDefinitions();
    expect(defs.map((d) => d.name)).toContain("get_weekly_allowance");
    expect(defs[0].input_schema).toHaveProperty("type", "object");
  });

  it("responde las preguntas de ejemplo con datos reales", async () => {
    expect(await runAssistantTool(db, uid, "get_spending_summary", { period: "this-month" }, now)).toMatchObject({
      expenses: "$123.000",
      income: "$500.000", // el saldo inicial cuenta como ingreso
    });
    const top = (await runAssistantTool(db, uid, "get_top_expense_categories", {}, now)) as { category: string }[];
    expect(top[0].category).toBe("Comida");
    // Quedan 177.000 en 8 días (23→30 sept); la semana termina el domingo 27 (5 días).
    expect(await runAssistantTool(db, uid, "get_weekly_allowance", {}, now)).toMatchObject({
      safeToSpendThisWeek: "$110.625",
      daysLeftInMonth: 8,
    });
    expect(await runAssistantTool(db, uid, "get_goals_progress", { name: "pc" }, now)).toEqual([
      expect.objectContaining({ goal: "PC nueva", percent: 17.5, requiredPerMonth: "$103.125" }),
    ]);
    expect(await runAssistantTool(db, uid, "get_ant_expenses", {}, now)).toMatchObject({ count: 1, total: "$3.000" });
    expect(await runAssistantTool(db, uid, "get_net_worth", {}, now)).toMatchObject({ totalCOP: "$377.000" });
  });

  it("valida la entrada", async () => {
    await expect(runAssistantTool(db, uid, "get_spending_summary", { period: "siempre" }, now)).rejects.toThrow();
    await expect(runAssistantTool(db, uid, "borrar_todo", {}, now)).rejects.toThrow(/desconocida/);
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { monthRange } from "@/lib/dates";
import type { Db } from "../db-client";
import { createTestDb, createTestUser } from "./test-db";
import { createAccount, getNetWorth, setAccountActive } from "../services/accounts";
import { balanceBreakdown } from "../services/balance-breakdown";
import { ensureDefaultCategories } from "../services/categories";
import { createTransaction } from "../services/transactions";

describe("cuadre del saldo del mes", () => {
  let db: Db;
  let uid: string;
  let cleanup: () => Promise<void>;
  let comida: string;
  let trabajo: string;
  const october = monthRange(2026, 10);
  const at = (iso: string) => new Date(`${iso}T17:00:00Z`);

  beforeEach(async () => {
    ({ db, cleanup, userId: uid } = await createTestDb());
    await ensureDefaultCategories(db, uid);
    comida = (await db.category.findFirstOrThrow({ where: { userId: uid, name: "Comida", kind: "EXPENSE" } })).id;
    trabajo = (await db.category.findFirstOrThrow({ where: { userId: uid, name: "Trabajo", kind: "INCOME" } })).id;
  });
  afterEach(() => cleanup());

  it("explica un saldo positivo aunque se gaste más de lo que entra", async () => {
    const banco = (await createAccount(db, uid, { name: "Banco", type: "BANK", currency: "COP", openingBalance: 100_000n, openingDate: at("2026-09-10") })).id;
    const nequi = (await createAccount(db, uid, { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP", openingBalance: 0n })).id;
    await createTransaction(db, uid, { type: "INCOME", amount: 30_000n, accountId: banco, categoryId: trabajo, date: at("2026-10-05") });
    await createTransaction(db, uid, { type: "EXPENSE", amount: 80_000n, accountId: banco, categoryId: comida, date: at("2026-10-06") });
    // Entre cuentas de la misma moneda no aparece.
    await createTransaction(db, uid, { type: "TRANSFER", amount: 10_000n, accountId: banco, toAccountId: nequi, date: at("2026-10-07") });
    await db.transaction.create({
      data: { userId: uid, type: "ADJUSTMENT", amount: 5_000n, accountId: nequi, date: at("2026-10-08"), description: "Ajuste de saldo" },
    });
    // Fuera del mes.
    await createTransaction(db, uid, { type: "EXPENSE", amount: 1_000n, accountId: banco, categoryId: comida, date: at("2026-11-02") });

    const [cop] = await balanceBreakdown(db, uid, october);
    expect(cop).toEqual({ currency: "COP", start: 100_000n, income: 30_000n, expense: 80_000n, adjustments: 5_000n, transfers: 0n, end: 55_000n });
  });

  it("cuenta el saldo inicial positivo como ingreso y el negativo como ajuste", async () => {
    await createAccount(db, uid, { name: "Banco", type: "BANK", currency: "COP", openingBalance: 50_000n, openingDate: at("2026-10-01") });
    await createAccount(db, uid, { name: "Tarjeta", type: "OTHER", currency: "COP", openingBalance: -20_000n, openingDate: at("2026-10-01") });
    const [cop] = await balanceBreakdown(db, uid, october);
    expect(cop).toMatchObject({ start: 0n, income: 50_000n, expense: 0n, adjustments: -20_000n, end: 30_000n });
  });

  it("cuadra cada moneda por separado, sin necesitar tasa", async () => {
    const banco = (await createAccount(db, uid, { name: "Banco", type: "BANK", currency: "COP", openingBalance: 500_000n, openingDate: at("2026-09-01") })).id;
    const binance = (await createAccount(db, uid, { name: "Binance", type: "CRYPTO", currency: "USDT", openingBalance: 1_000n, openingDate: at("2026-09-01") })).id;
    await createTransaction(db, uid, { type: "TRANSFER", amount: 400_000n, accountId: banco, toAccountId: binance, toAmount: 9_950n, date: at("2026-10-03") });
    await createTransaction(db, uid, { type: "EXPENSE", amount: 2_500n, accountId: binance, categoryId: comida, date: at("2026-10-04") });

    const items = await balanceBreakdown(db, uid, october);
    expect(items.map((c) => c.currency)).toEqual(["COP", "USDT"]);
    expect(items[0]).toMatchObject({ start: 500_000n, transfers: -400_000n, end: 100_000n });
    expect(items[1]).toMatchObject({ start: 1_000n, transfers: 9_950n, expense: 2_500n, end: 8_450n });
    // El saldo final coincide con el patrimonio por moneda.
    const worth = await getNetWorth(db, uid);
    expect(worth.byCurrency.map((c) => [c.currency, c.total])).toEqual(items.map((c) => [c.currency, c.end]));
  });

  it("ignora las cuentas desactivadas, como el patrimonio", async () => {
    const banco = (await createAccount(db, uid, { name: "Banco", type: "BANK", currency: "COP", openingBalance: 100_000n, openingDate: at("2026-09-01") })).id;
    const vieja = (await createAccount(db, uid, { name: "Vieja", type: "CASH", currency: "COP", openingBalance: 0n })).id;
    await createTransaction(db, uid, { type: "TRANSFER", amount: 40_000n, accountId: banco, toAccountId: vieja, date: at("2026-10-02") });
    await setAccountActive(db, uid, vieja, false);
    const [cop] = await balanceBreakdown(db, uid, october);
    expect(cop).toMatchObject({ start: 100_000n, transfers: -40_000n, end: 60_000n });
    expect((await getNetWorth(db, uid)).totalBase).toBe(60_000n);
  });

  it("solo ve las cuentas del usuario", async () => {
    await createAccount(db, uid, { name: "Banco", type: "BANK", currency: "COP", openingBalance: 100_000n, openingDate: at("2026-10-01") });
    const otro = await createTestUser(db, "otro");
    expect(await balanceBreakdown(db, otro, october)).toEqual([]);
  });
});

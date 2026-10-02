import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db-client";
import { createTestDb } from "./test-db";
import { ensureDefaultCategories } from "../services/categories";
import {
  createAccount,
  getNetWorth,
  listAccounts,
  reconcileBalance,
  setAccountActive,
  setOpeningBalance,
  updateAccount,
  deleteAccount,
} from "../services/accounts";
import { computeBalance } from "../services/ledger";
import {
  createTransaction,
  purgeTransaction,
  restoreTransaction,
  searchTransactions,
  trashTransaction,
  updateTransaction,
} from "../services/transactions";
import { setExchangeRate } from "../services/exchange-rates";

describe("libro contable", () => {
  let db: Db;
  let uid: string;
  let cleanup: () => Promise<void>;
  let bancolombia: string;
  let nequi: string;
  let comida: string;
  let trabajo: string;
  const today = new Date("2026-09-20T17:00:00Z");

  beforeEach(async () => {
    ({ db, cleanup, userId: uid } = await createTestDb());
    await ensureDefaultCategories(db, uid);
    bancolombia = (await createAccount(db, uid, { name: "Bancolombia", type: "BANK", currency: "COP", openingBalance: 500_000n })).id;
    nequi = (await createAccount(db, uid, { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP", openingBalance: 0n })).id;
    comida = (await db.category.findFirstOrThrow({ where: { name: "Comida", kind: "EXPENSE" } })).id;
    trabajo = (await db.category.findFirstOrThrow({ where: { name: "Trabajo", kind: "INCOME" } })).id;
  });
  afterEach(() => cleanup());

  it("el saldo inicial afecta el saldo pero no es un ingreso", async () => {
    expect(await computeBalance(db, uid, bancolombia)).toBe(500_000n);
    const incomes = await searchTransactions(db, uid, { type: "INCOME" });
    expect(incomes.total).toBe(0);
    // Saldo inicial 0 → no crea movimiento.
    expect((await searchTransactions(db, uid, { accountId: nequi })).total).toBe(0);
  });

  it('"Gasté $8.000 en comida" descuenta de la cuenta', async () => {
    const tx = await createTransaction(db, uid, { type: "EXPENSE", amount: 8_000n, accountId: bancolombia, categoryId: comida, date: today });
    expect(tx.description).toBe("Comida");
    expect(tx.category?.name).toBe("Comida");
    expect(await computeBalance(db, uid, bancolombia)).toBe(492_000n);
  });

  it("una transferencia mueve saldo sin crear ingresos ni gastos", async () => {
    await createTransaction(db, uid, { type: "TRANSFER", amount: 50_000n, accountId: bancolombia, toAccountId: nequi, date: today });
    expect(await computeBalance(db, uid, bancolombia)).toBe(450_000n);
    expect(await computeBalance(db, uid, nequi)).toBe(50_000n);
    expect((await getNetWorth(db, uid)).totalBase).toBe(500_000n);
    expect((await searchTransactions(db, uid, { type: "INCOME" })).total).toBe(0);
    expect((await searchTransactions(db, uid, { type: "EXPENSE" })).total).toBe(0);
    // Aparece al filtrar por cualquiera de las dos cuentas.
    expect((await searchTransactions(db, uid, { accountId: nequi })).total).toBe(1);
  });

  it("rechaza transferencias inválidas", async () => {
    await expect(
      createTransaction(db, uid, { type: "TRANSFER", amount: 1_000n, accountId: nequi, toAccountId: nequi, date: today }),
    ).rejects.toThrow(/diferente/);
    await expect(
      createTransaction(db, uid, { type: "TRANSFER", amount: 1_000n, accountId: nequi, date: today }),
    ).rejects.toThrow(/destino/);
  });

  it("transferencias entre monedas exigen el monto recibido", async () => {
    const binance = (await createAccount(db, uid, { name: "Binance", type: "CRYPTO", currency: "USDT", openingBalance: 0n })).id;
    await expect(
      createTransaction(db, uid, { type: "TRANSFER", amount: 400_000n, accountId: bancolombia, toAccountId: binance, date: today }),
    ).rejects.toThrow(/Indica cuánto llega/);
    await createTransaction(db, uid, {
      type: "TRANSFER", amount: 400_000n, accountId: bancolombia, toAccountId: binance, toAmount: 9_950n, date: today,
    });
    expect(await computeBalance(db, uid, binance)).toBe(9_950n); // 99,50 USDT

    const worth = await getNetWorth(db, uid);
    expect(worth.missingRates).toEqual(["USDT"]);
    expect(worth.totalBase).toBe(100_000n); // USDT excluido hasta tener tasa

    await setExchangeRate(db, uid, "USDT", 4_000_000_000n); // 4.000 COP por USDT
    expect((await getNetWorth(db, uid)).totalBase).toBe(100_000n + 398_000n);
  });

  it("valida montos, categorías y cuentas", async () => {
    await expect(
      createTransaction(db, uid, { type: "EXPENSE", amount: 0n, accountId: bancolombia, categoryId: comida, date: today }),
    ).rejects.toThrow(/mayor a 0/);
    await expect(
      createTransaction(db, uid, { type: "EXPENSE", amount: -5n, accountId: bancolombia, categoryId: comida, date: today }),
    ).rejects.toThrow(/mayor a 0/);
    await expect(
      createTransaction(db, uid, { type: "INCOME", amount: 5n, accountId: bancolombia, categoryId: comida, date: today }),
    ).rejects.toThrow(/categoría de ingreso/);
    await expect(
      createTransaction(db, uid, { type: "EXPENSE", amount: 5n, accountId: bancolombia, date: today }),
    ).rejects.toThrow(/categoría/);
    await setAccountActive(db, uid, nequi, false);
    await expect(
      createTransaction(db, uid, { type: "EXPENSE", amount: 5n, accountId: nequi, categoryId: comida, date: today }),
    ).rejects.toThrow(/inactiva/);
  });

  it("editar un movimiento recalcula los saldos de ambas cuentas", async () => {
    const tx = await createTransaction(db, uid, { type: "EXPENSE", amount: 8_000n, accountId: bancolombia, categoryId: comida, date: today });
    await createTransaction(db, uid, { type: "INCOME", amount: 100_000n, accountId: nequi, categoryId: trabajo, date: today });
    await updateTransaction(db, uid, tx.id, { type: "EXPENSE", amount: 10_000n, accountId: nequi, categoryId: comida, date: today });
    expect(await computeBalance(db, uid, bancolombia)).toBe(500_000n);
    expect(await computeBalance(db, uid, nequi)).toBe(90_000n);
  });

  it("la papelera excluye el movimiento del saldo y se puede restaurar", async () => {
    const tx = await createTransaction(db, uid, { type: "EXPENSE", amount: 8_000n, accountId: bancolombia, categoryId: comida, date: today });
    await trashTransaction(db, uid, tx.id);
    expect(await computeBalance(db, uid, bancolombia)).toBe(500_000n);
    expect((await searchTransactions(db, uid, { trashed: true })).total).toBe(1);
    await restoreTransaction(db, uid, tx.id);
    expect(await computeBalance(db, uid, bancolombia)).toBe(492_000n);
    await expect(purgeTransaction(db, uid, tx.id)).rejects.toThrow(/papelera/);
    await trashTransaction(db, uid, tx.id);
    await purgeTransaction(db, uid, tx.id);
    expect((await searchTransactions(db, uid, { trashed: true })).total).toBe(0);
  });

  it("el ajuste de saldo cuadra la cuenta sin afectar ingresos/gastos", async () => {
    await reconcileBalance(db, uid, bancolombia, 480_000n, today);
    expect(await computeBalance(db, uid, bancolombia)).toBe(480_000n);
    expect((await searchTransactions(db, uid, { type: "EXPENSE" })).total).toBe(0);
    expect(await reconcileBalance(db, uid, bancolombia, 480_000n, today)).toBeNull();
  });

  it("el saldo inicial se puede modificar y el saldo actual se recalcula", async () => {
    await createTransaction(db, uid, { type: "EXPENSE", amount: 8_000n, accountId: bancolombia, categoryId: comida, date: today });
    await updateAccount(db, uid, bancolombia, { name: "Bancolombia", type: "BANK", currency: "COP", openingBalance: 700_000n });
    expect(await computeBalance(db, uid, bancolombia)).toBe(692_000n);
    expect((await searchTransactions(db, uid, { type: "OPENING_BALANCE" })).total).toBe(1);
    expect((await listAccounts(db, uid)).find((a) => a.id === bancolombia)?.openingBalance).toBe(700_000n);
    // Sin openingBalance no se toca.
    await updateAccount(db, uid, bancolombia, { name: "Banco", type: "BANK", currency: "COP" });
    expect(await computeBalance(db, uid, bancolombia)).toBe(692_000n);
    // En 0 se elimina el movimiento.
    await setOpeningBalance(db, uid, bancolombia, 0n);
    expect(await computeBalance(db, uid, bancolombia)).toBe(-8_000n);
    expect((await searchTransactions(db, uid, { type: "OPENING_BALANCE" })).total).toBe(0);
  });

  it("crea el saldo inicial en una cuenta que no tenía, con la fecha de su primer movimiento", async () => {
    await createTransaction(db, uid, { type: "TRANSFER", amount: 50_000n, accountId: bancolombia, toAccountId: nequi, date: today });
    const opening = await setOpeningBalance(db, uid, nequi, 20_000n);
    expect(opening?.date).toEqual(today);
    expect(await computeBalance(db, uid, nequi)).toBe(70_000n);
    expect((await searchTransactions(db, uid, { type: "INCOME" })).total).toBe(0);
  });

  it("no permite nombres de cuenta duplicados aunque cambien mayúsculas o espacios", async () => {
    await expect(
      createAccount(db, uid, { name: " nequi ", type: "CASH", currency: "COP", openingBalance: 0n }),
    ).rejects.toThrow(/Ya existe/);
  });

  it("no elimina cuentas con movimientos", async () => {
    await expect(deleteAccount(db, uid, bancolombia)).rejects.toThrow(/Desactívala/);
    await deleteAccount(db, uid, nequi);
    expect((await listAccounts(db, uid, { includeInactive: true })).map((a) => a.name)).toEqual(["Bancolombia"]);
  });

  it("busca y filtra movimientos", async () => {
    await createTransaction(db, uid, { type: "EXPENSE", amount: 8_000n, accountId: bancolombia, categoryId: comida, date: today, description: "Almuerzo" });
    await createTransaction(db, uid, { type: "EXPENSE", amount: 3_000n, accountId: bancolombia, categoryId: comida, date: new Date("2026-08-10T17:00:00Z"), description: "Empanada" });
    await createTransaction(db, uid, { type: "INCOME", amount: 900_000n, accountId: nequi, categoryId: trabajo, date: today, description: "Pago quincena" });

    expect((await searchTransactions(db, uid, { q: "comida" })).total).toBe(2); // por nombre de categoría
    expect((await searchTransactions(db, uid, { q: "EMPANADA" })).total).toBe(1); // sin distinguir mayúsculas
    expect((await searchTransactions(db, uid, { minAmount: 5_000n, maxAmount: 10_000n })).total).toBe(1);
    expect((await searchTransactions(db, uid, { from: new Date("2026-09-01T05:00:00Z"), to: new Date("2026-10-01T05:00:00Z"), type: "EXPENSE" })).total).toBe(1);
    expect((await searchTransactions(db, uid, { categoryId: trabajo })).items[0].description).toBe("Pago quincena");
  });
});

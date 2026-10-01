import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import type { Db } from "../db-client";
import { createTestDb } from "./test-db";
import { ensureDefaultCategories, deleteCategory, createCategory } from "../services/categories";
import { DEFAULT_CATEGORIES } from "../services/defaults";

/**
 * Verifica que las CHECK constraints de la BD sigan presentes y bloqueen
 * datos financieros inválidos aunque se salte la capa de servicios.
 */
describe("integridad de la base de datos", () => {
  let db: Db;
  let raw: Database.Database;
  let cleanup: () => Promise<void>;
  let accountA: string;
  let accountB: string;
  let expenseCat: string;

  beforeAll(async () => {
    ({ db, raw, cleanup } = await createTestDb());
    await ensureDefaultCategories(db);
    accountA = (await db.account.create({ data: { name: "Bancolombia", type: "BANK" } })).id;
    accountB = (await db.account.create({ data: { name: "Nequi", type: "DIGITAL_WALLET" } })).id;
    expenseCat = (await db.category.findFirstOrThrow({ where: { name: "Comida", kind: "EXPENSE" } })).id;
  });
  afterAll(() => cleanup());

  const insert = (values: Record<string, unknown>) => {
    const row = {
      id: `t${Math.random()}`,
      type: "EXPENSE",
      amount: 1000,
      accountId: accountA,
      toAccountId: null,
      toAmount: null,
      categoryId: expenseCat,
      date: new Date().toISOString(),
      description: "x",
      updatedAt: new Date().toISOString(),
      ...values,
    };
    raw
      .prepare(
        `INSERT INTO "Transaction" (id,type,amount,accountId,toAccountId,toAmount,categoryId,date,description,updatedAt)
         VALUES (@id,@type,@amount,@accountId,@toAccountId,@toAmount,@categoryId,@date,@description,@updatedAt)`,
      )
      .run(row);
  };

  it("acepta un gasto válido", () => {
    expect(() => insert({})).not.toThrow();
  });

  it("rechaza montos cero o negativos en ingresos, gastos y transferencias", () => {
    expect(() => insert({ amount: 0 })).toThrow(/CHECK/);
    expect(() => insert({ amount: -500 })).toThrow(/CHECK/);
  });

  it("rechaza un gasto sin categoría", () => {
    expect(() => insert({ categoryId: null })).toThrow(/CHECK/);
  });

  it("rechaza transferencias a la misma cuenta o sin destino", () => {
    const base = { type: "TRANSFER", categoryId: null, toAmount: 1000 };
    expect(() => insert({ ...base, toAccountId: accountA })).toThrow(/CHECK/);
    expect(() => insert({ ...base, toAccountId: null })).toThrow(/CHECK/);
    expect(() => insert({ ...base, toAccountId: accountB })).not.toThrow();
  });

  it("rechaza transferencias con categoría", () => {
    expect(() => insert({ type: "TRANSFER", toAccountId: accountB, toAmount: 1000 })).toThrow(/CHECK/);
  });

  it("permite saldo inicial con signo pero no cero", () => {
    expect(() => insert({ type: "OPENING_BALANCE", categoryId: null, amount: -2000 })).not.toThrow();
    expect(() => insert({ type: "OPENING_BALANCE", categoryId: null, amount: 0 })).toThrow(/CHECK/);
  });

  it("rechaza descripciones vacías", () => {
    expect(() => insert({ description: "   " })).toThrow(/CHECK/);
  });

  it("no permite borrar una cuenta con movimientos", async () => {
    await expect(db.account.delete({ where: { id: accountA } })).rejects.toThrow();
  });

  it("crea las categorías predeterminadas una sola vez", async () => {
    expect(await db.category.count()).toBe(DEFAULT_CATEGORIES.length);
    expect(await ensureDefaultCategories(db)).toBe(0);
  });

  it("no elimina categorías en uso y evita nombres duplicados", async () => {
    await expect(deleteCategory(db, expenseCat)).rejects.toThrow(/Archívala/);
    await expect(createCategory(db, { name: "Comida", kind: "EXPENSE" })).rejects.toThrow(/Ya existe/);
    await expect(createCategory(db, { name: "educacion", kind: "EXPENSE" })).rejects.toThrow(/Ya existe/);
    // El mismo nombre sí puede existir como ingreso y como gasto ("Otros").
    await expect(createCategory(db, { name: "Comida", kind: "INCOME" })).resolves.toBeTruthy();
  });
});

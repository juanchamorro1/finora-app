import type { AccountType } from "@/generated/prisma/enums";
import { BASE_CURRENCY, isCurrencyCode } from "@/lib/currency";
import { sumBigInt } from "@/lib/money";
import { sameName } from "@/lib/text";
import { withTx, type Db, type DbTx } from "../db-client";
import { DomainError, assertDomain } from "../errors";
import { getRateTable, toBase } from "./exchange-rates";
import { computeBalance, computeBalances } from "./ledger";

export interface AccountWithBalance {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  balance: bigint;
  /** Saldo convertido a COP (null si falta la tasa). */
  balanceBase: bigint | null;
  transactionCount: number;
}

export async function listAccounts(db: Db, opts: { includeInactive?: boolean } = {}): Promise<AccountWithBalance[]> {
  const [accounts, balances, rates] = await Promise.all([
    db.account.findMany({
      where: opts.includeInactive ? undefined : { isActive: true },
      orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        _count: {
          select: {
            transactions: { where: { deletedAt: null } },
            incomingTransfers: { where: { deletedAt: null } },
          },
        },
      },
    }),
    computeBalances(db),
    getRateTable(db),
  ]);
  return accounts.map((a) => {
    const balance = balances.get(a.id) ?? 0n;
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      isActive: a.isActive,
      sortOrder: a.sortOrder,
      balance,
      balanceBase: toBase(balance, a.currency, rates),
      transactionCount: a._count.transactions + a._count.incomingTransfers,
    };
  });
}

export interface NetWorth {
  /** Suma en COP de las cuentas activas (las de otras monedas convertidas si hay tasa). */
  totalBase: bigint;
  /** Totales por moneda (sin convertir) de las cuentas activas. */
  byCurrency: { currency: string; total: bigint; hasRate: boolean }[];
  /** Monedas sin tasa: no están incluidas en totalBase. */
  missingRates: string[];
}

export async function getNetWorth(db: Db): Promise<NetWorth> {
  const accounts = await listAccounts(db);
  const rates = await getRateTable(db);
  const byCurrency = new Map<string, bigint>();
  for (const a of accounts) byCurrency.set(a.currency, (byCurrency.get(a.currency) ?? 0n) + a.balance);
  const missingRates = [...byCurrency.keys()].filter((c) => !rates.has(c));
  return {
    totalBase: sumBigInt(accounts.map((a) => a.balanceBase ?? 0n)),
    byCurrency: [...byCurrency.entries()]
      .map(([currency, total]) => ({ currency, total, hasRate: rates.has(currency) }))
      .sort((a, b) => (a.currency === BASE_CURRENCY ? -1 : b.currency === BASE_CURRENCY ? 1 : 0)),
    missingRates,
  };
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  currency: string;
  /** Saldo inicial en unidades mínimas (puede ser 0 o negativo, ej. deuda). */
  openingBalance: bigint;
  openingDate?: Date;
}

async function assertNameAvailable(db: Db | DbTx, name: string, exceptId?: string) {
  const accounts = await db.account.findMany({ select: { id: true, name: true } });
  const clash = accounts.find((a) => a.id !== exceptId && sameName(a.name, name));
  if (clash) throw new DomainError(`Ya existe una cuenta llamada "${name}"`, "name");
}

/**
 * Crea una cuenta. El saldo inicial se registra como movimiento OPENING_BALANCE,
 * que afecta el saldo pero NO cuenta como ingreso.
 */
export async function createAccount(db: Db | DbTx, input: CreateAccountInput) {
  const name = input.name.trim();
  assertDomain(name.length > 0, "El nombre es obligatorio", "name");
  assertDomain(isCurrencyCode(input.currency), "Moneda no soportada", "currency");
  await assertNameAvailable(db, name);

  return withTx(db, async (tx) => {
    const last = await tx.account.findFirst({ orderBy: { sortOrder: "desc" } });
    const account = await tx.account.create({
      data: { name, type: input.type, currency: input.currency, sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
    if (input.openingBalance !== 0n) {
      await tx.transaction.create({
        data: {
          type: "OPENING_BALANCE",
          amount: input.openingBalance,
          accountId: account.id,
          date: input.openingDate ?? new Date(),
          description: "Saldo inicial",
        },
      });
    }
    return account;
  });
}

/** La moneda no se puede cambiar si la cuenta ya tiene movimientos. */
export async function updateAccount(
  db: Db,
  id: string,
  input: { name: string; type: AccountType; currency: string },
) {
  const account = await db.account.findUnique({ where: { id } });
  assertDomain(account, "La cuenta no existe");
  const name = input.name.trim();
  assertDomain(name.length > 0, "El nombre es obligatorio", "name");
  assertDomain(isCurrencyCode(input.currency), "Moneda no soportada", "currency");
  await assertNameAvailable(db, name, id);
  if (input.currency !== account.currency) {
    const count = await db.transaction.count({
      where: { OR: [{ accountId: id }, { toAccountId: id }] },
    });
    assertDomain(count === 0, "No puedes cambiar la moneda de una cuenta con movimientos", "currency");
  }
  return db.account.update({ where: { id }, data: { name, type: input.type, currency: input.currency } });
}

export async function setAccountActive(db: Db, id: string, isActive: boolean) {
  const account = await db.account.findUnique({ where: { id } });
  assertDomain(account, "La cuenta no existe");
  return db.account.update({ where: { id }, data: { isActive } });
}

/**
 * Registra un ajuste para que el saldo coincida con el real (ej. el banco dice X).
 * Queda como movimiento ADJUSTMENT visible en el historial; no es ingreso ni gasto.
 */
export async function reconcileBalance(db: Db, id: string, actualBalance: bigint, date: Date = new Date()) {
  const account = await db.account.findUnique({ where: { id } });
  assertDomain(account, "La cuenta no existe");
  return withTx(db, async (tx) => {
    const current = await computeBalance(tx, id);
    const diff = actualBalance - current;
    if (diff === 0n) return null;
    return tx.transaction.create({
      data: { type: "ADJUSTMENT", amount: diff, accountId: id, date, description: "Ajuste de saldo" },
    });
  });
}

/** Solo se elimina una cuenta sin ningún movimiento (ni en la papelera); si no, se desactiva. */
export async function deleteAccount(db: Db, id: string) {
  const count = await db.transaction.count({ where: { OR: [{ accountId: id }, { toAccountId: id }] } });
  if (count > 0) {
    throw new DomainError("La cuenta tiene movimientos. Desactívala en lugar de eliminarla.");
  }
  await db.account.delete({ where: { id } });
}

import type { AccountType } from "@/generated/prisma/enums";
import { BASE_CURRENCY, isCurrencyCode } from "@/lib/currency";
import { sumBigInt } from "@/lib/money";
import { sameName } from "@/lib/text";
import { withTx, type Db, type DbTx } from "../db-client";
import { DomainError, assertDomain } from "../errors";
import { getRateTable, toBase } from "./exchange-rates";
import { computeBalances } from "./ledger";

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
  /** Saldo inicial registrado (0 si no tiene). */
  openingBalance: bigint;
  transactionCount: number;
}

/** Cuenta del usuario o error "no existe" (nunca revela cuentas de otros). */
export async function getOwnAccount(db: Db | DbTx, userId: string, id: string, field?: string) {
  const account = await db.account.findFirst({ where: { id, userId } });
  assertDomain(account, "La cuenta no existe", field);
  return account;
}

export async function listAccounts(
  db: Db,
  userId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<AccountWithBalance[]> {
  const [accounts, balances, rates, openingRows] = await Promise.all([
    db.account.findMany({
      where: { userId, ...(opts.includeInactive ? {} : { isActive: true }) },
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
    computeBalances(db, userId),
    getRateTable(db, userId),
    db.transaction.findMany({
      where: { userId, type: "OPENING_BALANCE", deletedAt: null },
      select: { accountId: true, amount: true },
    }),
  ]);
  const openings = new Map<string, bigint>();
  for (const t of openingRows) openings.set(t.accountId, (openings.get(t.accountId) ?? 0n) + t.amount);
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
      openingBalance: openings.get(a.id) ?? 0n,
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

export async function getNetWorth(db: Db, userId: string): Promise<NetWorth> {
  const [accounts, rates] = await Promise.all([listAccounts(db, userId), getRateTable(db, userId)]);
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

async function assertNameAvailable(db: Db | DbTx, userId: string, name: string, exceptId?: string) {
  const accounts = await db.account.findMany({ where: { userId }, select: { id: true, name: true } });
  const clash = accounts.find((a) => a.id !== exceptId && sameName(a.name, name));
  if (clash) throw new DomainError(`Ya existe una cuenta llamada "${name}"`, "name");
}

/**
 * Crea una cuenta. El saldo inicial se registra como movimiento OPENING_BALANCE,
 * que afecta el saldo pero NO cuenta como ingreso.
 */
export async function createAccount(db: Db | DbTx, userId: string, input: CreateAccountInput) {
  const name = input.name.trim();
  assertDomain(name.length > 0, "El nombre es obligatorio", "name");
  assertDomain(isCurrencyCode(input.currency), "Moneda no soportada", "currency");
  await assertNameAvailable(db, userId, name);

  return withTx(db, async (tx) => {
    const last = await tx.account.findFirst({ where: { userId }, orderBy: { sortOrder: "desc" } });
    const account = await tx.account.create({
      data: { userId, name, type: input.type, currency: input.currency, sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
    if (input.openingBalance !== 0n) {
      await tx.transaction.create({
        data: {
          userId,
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

/**
 * La moneda no se puede cambiar si la cuenta ya tiene movimientos.
 * Si se envía `openingBalance`, reemplaza el saldo inicial (ver `setOpeningBalance`).
 */
export async function updateAccount(
  db: Db,
  userId: string,
  id: string,
  input: { name: string; type: AccountType; currency: string; openingBalance?: bigint },
) {
  const account = await getOwnAccount(db, userId, id);
  const name = input.name.trim();
  assertDomain(name.length > 0, "El nombre es obligatorio", "name");
  assertDomain(isCurrencyCode(input.currency), "Moneda no soportada", "currency");
  await assertNameAvailable(db, userId, name, id);
  if (input.currency !== account.currency) {
    const count = await db.transaction.count({
      where: { userId, OR: [{ accountId: id }, { toAccountId: id }] },
    });
    assertDomain(count === 0, "No puedes cambiar la moneda de una cuenta con movimientos", "currency");
  }
  return withTx(db, async (tx) => {
    const updated = await tx.account.update({ where: { id }, data: { name, type: input.type, currency: input.currency } });
    if (input.openingBalance !== undefined) await setOpeningBalance(tx, userId, id, input.openingBalance);
    return updated;
  });
}

/**
 * Cambia el saldo inicial de la cuenta. El saldo actual se recalcula solo (se deriva del libro).
 * Edita el movimiento OPENING_BALANCE existente; si no hay, lo crea con la fecha del primer
 * movimiento de la cuenta; con 0 lo elimina.
 */
export async function setOpeningBalance(db: Db | DbTx, userId: string, id: string, amount: bigint) {
  await getOwnAccount(db, userId, id, "openingBalance");
  return withTx(db, async (tx) => {
    const openings = await tx.transaction.findMany({
      where: { userId, accountId: id, type: "OPENING_BALANCE", deletedAt: null },
      orderBy: { date: "asc" },
    });
    const [current, ...extra] = openings;
    // Solo debe haber uno; si hubiera más, se dejan en la papelera para no sumarlos dos veces.
    if (extra.length > 0) {
      await tx.transaction.updateMany({ where: { id: { in: extra.map((t) => t.id) } }, data: { deletedAt: new Date() } });
    }
    if (amount === 0n) {
      if (current) await tx.transaction.delete({ where: { id: current.id } });
      return null;
    }
    if (current) {
      return current.amount === amount
        ? current
        : tx.transaction.update({ where: { id: current.id }, data: { amount } });
    }
    const first = await tx.transaction.findFirst({
      where: { userId, deletedAt: null, OR: [{ accountId: id }, { toAccountId: id }] },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    return tx.transaction.create({
      data: {
        userId,
        type: "OPENING_BALANCE",
        amount,
        accountId: id,
        date: first?.date ?? new Date(),
        description: "Saldo inicial",
      },
    });
  });
}

export async function setAccountActive(db: Db, userId: string, id: string, isActive: boolean) {
  await getOwnAccount(db, userId, id);
  return db.account.update({ where: { id }, data: { isActive } });
}

/** Solo se elimina una cuenta sin ningún movimiento (ni en la papelera); si no, se desactiva. */
export async function deleteAccount(db: Db, userId: string, id: string) {
  await getOwnAccount(db, userId, id);
  const count = await db.transaction.count({ where: { OR: [{ accountId: id }, { toAccountId: id }] } });
  if (count > 0) {
    throw new DomainError("La cuenta tiene movimientos. Desactívala en lugar de eliminarla.");
  }
  await db.account.delete({ where: { id } });
}

import type { Prisma } from "@/generated/prisma/client";
import type { TransactionType } from "@/generated/prisma/enums";
import type { Db, DbTx } from "../db-client";

/**
 * Libro contable: el saldo de una cuenta es SIEMPRE la suma de sus movimientos
 * no eliminados. No existe un campo de saldo editable.
 *
 *   INCOME           +amount
 *   EXPENSE          −amount
 *   TRANSFER         −amount en origen, +toAmount en destino
 *   OPENING_BALANCE  ±amount (con signo)
 *   ADJUSTMENT       ±amount (con signo)
 */

export const ACTIVE_TX: Prisma.TransactionWhereInput = { deletedAt: null };

/** Tipos que cuentan como flujo real de dinero en estadísticas. */
export const FLOW_TYPES: TransactionType[] = ["INCOME", "EXPENSE"];

export function signedEffect(type: TransactionType, amount: bigint): bigint {
  switch (type) {
    case "INCOME":
    case "OPENING_BALANCE":
    case "ADJUSTMENT":
      return amount;
    case "EXPENSE":
    case "TRANSFER":
      return -amount;
  }
}

/** Saldos de todas las cuentas (o de las indicadas), en unidades mínimas de cada cuenta. */
export async function computeBalances(
  db: Db | DbTx,
  opts: { accountIds?: string[]; before?: Date } = {},
): Promise<Map<string, bigint>> {
  const dateFilter = opts.before ? { date: { lt: opts.before } } : {};
  const [outgoing, incoming] = await Promise.all([
    db.transaction.groupBy({
      by: ["accountId", "type"],
      where: { ...ACTIVE_TX, ...dateFilter, accountId: opts.accountIds ? { in: opts.accountIds } : undefined },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ["toAccountId"],
      where: {
        ...ACTIVE_TX,
        ...dateFilter,
        type: "TRANSFER",
        toAccountId: opts.accountIds ? { in: opts.accountIds } : { not: null },
      },
      _sum: { toAmount: true },
    }),
  ]);

  const balances = new Map<string, bigint>();
  for (const id of opts.accountIds ?? []) balances.set(id, 0n);
  const add = (id: string, value: bigint) => balances.set(id, (balances.get(id) ?? 0n) + value);

  for (const row of outgoing) add(row.accountId, signedEffect(row.type, row._sum.amount ?? 0n));
  for (const row of incoming) if (row.toAccountId) add(row.toAccountId, row._sum.toAmount ?? 0n);
  return balances;
}

export async function computeBalance(db: Db | DbTx, accountId: string): Promise<bigint> {
  return (await computeBalances(db, { accountIds: [accountId] })).get(accountId) ?? 0n;
}

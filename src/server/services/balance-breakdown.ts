import type { DateRange } from "@/lib/dates";
import { BASE_CURRENCY } from "@/lib/currency";
import type { Db, DbTx } from "../db-client";
import { computeBalances } from "./ledger";

/**
 * Cuadre del saldo de un periodo, por moneda y sin convertir (no necesita tasas):
 *
 *   saldo al empezar + ingresos − gastos ± ajustes ± transferencias = saldo al terminar
 *
 * Responde "¿por qué gasté más de lo que me entró y aun así tengo saldo?": la
 * diferencia sale de lo que ya había en las cuentas o de los ajustes de saldo.
 *
 * Ingresos y gastos se cuentan igual que en `analytics.ts`: el saldo inicial
 * positivo es ingreso; un saldo inicial negativo (deuda) va con los ajustes.
 * Solo cuentan las cuentas activas (como `getNetWorth`); una transferencia entre
 * dos de ellas en la misma moneda se cancela, y si cruza de moneda (o va a una
 * cuenta desactivada) aparece en "transferencias".
 */

export interface CurrencyBreakdown {
  currency: string;
  /** Saldo de las cuentas activas antes del periodo. */
  start: bigint;
  income: bigint;
  expense: bigint;
  /** Ajustes de saldo y saldos iniciales negativos (con signo). */
  adjustments: bigint;
  /** Neto de transferencias con otras monedas o cuentas desactivadas (con signo). */
  transfers: bigint;
  /** start + income − expense + adjustments + transfers. */
  end: bigint;
}

export async function balanceBreakdown(db: Db | DbTx, userId: string, range: DateRange): Promise<CurrencyBreakdown[]> {
  const accounts = await db.account.findMany({ where: { userId, isActive: true }, select: { id: true, currency: true } });
  if (accounts.length === 0) return [];
  const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
  const ids = accounts.map((a) => a.id);

  const [startBalances, rows] = await Promise.all([
    computeBalances(db, userId, { accountIds: ids, before: range.from }),
    db.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        date: { gte: range.from, lt: range.to },
        OR: [{ accountId: { in: ids } }, { toAccountId: { in: ids } }],
      },
      select: { type: true, amount: true, toAmount: true, accountId: true, toAccountId: true },
    }),
  ]);

  const map = new Map<string, CurrencyBreakdown>();
  const entry = (currency: string) => {
    let e = map.get(currency);
    if (!e) {
      e = { currency, start: 0n, income: 0n, expense: 0n, adjustments: 0n, transfers: 0n, end: 0n };
      map.set(currency, e);
    }
    return e;
  };
  for (const a of accounts) entry(a.currency).start += startBalances.get(a.id) ?? 0n;

  for (const t of rows) {
    const from = currencyOf.get(t.accountId);
    const to = t.toAccountId ? currencyOf.get(t.toAccountId) : undefined;
    if (t.type === "TRANSFER") {
      if (from && from === to) continue;
      if (from) entry(from).transfers -= t.amount;
      if (to) entry(to).transfers += t.toAmount ?? 0n;
      continue;
    }
    if (!from) continue;
    const e = entry(from);
    if (t.type === "INCOME" || (t.type === "OPENING_BALANCE" && t.amount > 0n)) e.income += t.amount;
    else if (t.type === "EXPENSE") e.expense += t.amount;
    else e.adjustments += t.amount;
  }

  return [...map.values()]
    .map((e) => ({ ...e, end: e.start + e.income - e.expense + e.adjustments + e.transfers }))
    .sort((a, b) => (a.currency === BASE_CURRENCY ? -1 : b.currency === BASE_CURRENCY ? 1 : a.currency.localeCompare(b.currency)));
}

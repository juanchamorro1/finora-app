import { BASE_CURRENCY } from "@/lib/currency";
import { convertToBase } from "@/lib/money";
import type { Db, DbTx } from "../db-client";
import { assertDomain } from "../errors";

/** Tasas "COP por 1 unidad" (×1e6) indexadas por moneda. COP siempre = 1. */
export type RateTable = Map<string, bigint>;

export async function getRateTable(db: Db | DbTx): Promise<RateTable> {
  const rows = await db.exchangeRate.findMany();
  const table: RateTable = new Map(rows.map((r) => [r.currency, r.rateMicros]));
  table.set(BASE_CURRENCY, 1_000_000n);
  return table;
}

export async function setExchangeRate(db: Db | DbTx, currency: string, rateMicros: bigint) {
  assertDomain(currency !== BASE_CURRENCY, "La moneda principal no necesita tasa");
  assertDomain(rateMicros > 0n, "La tasa debe ser mayor a 0");
  return db.exchangeRate.upsert({
    where: { currency },
    create: { currency, rateMicros },
    update: { rateMicros },
  });
}

/** Convierte a COP. Devuelve null si falta la tasa de esa moneda. */
export function toBase(amount: bigint, currency: string, rates: RateTable): bigint | null {
  const rate = rates.get(currency);
  if (rate === undefined) return null;
  return convertToBase(amount, currency, rate);
}

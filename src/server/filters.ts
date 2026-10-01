import type { TransactionType } from "@/generated/prisma/enums";
import { addDays, dateKeyToStartOfDay, isValidDateKey } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import type { TransactionFilters } from "./services/transactions";

type SearchParams = Record<string, string | string[] | undefined>;

const TYPES: TransactionType[] = ["INCOME", "EXPENSE", "TRANSFER", "OPENING_BALANCE", "ADJUSTMENT"];

function single(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v?.trim() || undefined;
}

function money(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  try {
    const parsed = parseMoney(value);
    return parsed >= 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Traduce los query params de /movimientos a filtros del servicio (ignorando valores inválidos). */
export function parseTransactionFilters(params: SearchParams): TransactionFilters & { page: number } {
  const type = single(params.type);
  const from = single(params.from);
  const to = single(params.to);
  const page = Number.parseInt(single(params.page) ?? "1", 10);
  return {
    q: single(params.q)?.slice(0, 100),
    type: type && TYPES.includes(type as TransactionType) ? (type as TransactionType) : undefined,
    categoryId: single(params.category),
    accountId: single(params.account),
    from: from && isValidDateKey(from) ? dateKeyToStartOfDay(from) : undefined,
    // "hasta" es inclusivo en la UI.
    to: to && isValidDateKey(to) ? addDays(dateKeyToStartOfDay(to), 1) : undefined,
    minAmount: money(single(params.min)),
    maxAmount: money(single(params.max)),
    trashed: single(params.view) === "papelera",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

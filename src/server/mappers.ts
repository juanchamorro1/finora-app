import type { AccountOption, CategoryOption, TransactionRow } from "@/types/finance";
import type { AccountWithBalance } from "./services/accounts";
import type { TransactionWithRelations } from "./services/transactions";

/** Convierte resultados de servicios en objetos planos para componentes cliente. */

export function toTransactionRow(tx: TransactionWithRelations): TransactionRow {
  return {
    id: tx.id,
    type: tx.type,
    amount: tx.amount,
    toAmount: tx.toAmount,
    date: tx.date,
    description: tx.description,
    note: tx.note,
    deletedAt: tx.deletedAt,
    account: { id: tx.account.id, name: tx.account.name, currency: tx.account.currency },
    toAccount: tx.toAccount ? { id: tx.toAccount.id, name: tx.toAccount.name, currency: tx.toAccount.currency } : null,
    category: tx.category
      ? { id: tx.category.id, name: tx.category.name, icon: tx.category.icon, color: tx.category.color }
      : null,
  };
}

export function toAccountOption(a: AccountWithBalance): AccountOption {
  return { id: a.id, name: a.name, type: a.type, currency: a.currency, isActive: a.isActive, balance: a.balance };
}

export function toCategoryOption(c: {
  id: string;
  name: string;
  kind: CategoryOption["kind"];
  icon: string;
  color: string;
  isArchived: boolean;
  systemKey?: string | null;
}): CategoryOption {
  return { id: c.id, name: c.name, kind: c.kind, icon: c.icon, color: c.color, isArchived: c.isArchived, isSystem: Boolean(c.systemKey) };
}

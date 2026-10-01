import type { AccountType, CategoryKind, TransactionType } from "@/generated/prisma/enums";

/** Datos mínimos de una cuenta que necesitan los formularios del cliente. */
export interface AccountOption {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  isActive: boolean;
  balance: bigint;
}

export interface CategoryOption {
  id: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  isArchived: boolean;
}

/** Movimiento listo para mostrar (serializable a componentes cliente). */
export interface TransactionRow {
  id: string;
  type: TransactionType;
  amount: bigint;
  toAmount: bigint | null;
  date: Date;
  description: string;
  note: string | null;
  deletedAt: Date | null;
  account: { id: string; name: string; currency: string };
  toAccount: { id: string; name: string; currency: string } | null;
  category: { id: string; name: string; icon: string; color: string } | null;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  BANK: "Banco",
  DIGITAL_WALLET: "Billetera digital",
  CASH: "Efectivo",
  CRYPTO: "Cripto",
  OTHER: "Otra",
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: "Ingreso",
  EXPENSE: "Gasto",
  TRANSFER: "Transferencia",
  OPENING_BALANCE: "Saldo inicial",
  ADJUSTMENT: "Ajuste",
};

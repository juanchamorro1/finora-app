"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toDateKey } from "@/lib/dates";
import { formatAmountInput } from "@/lib/money";
import type { AccountOption, CategoryOption, TransactionRow } from "@/types/finance";
import { TransactionForm, rememberedAccountId, type TransactionFormInitial } from "./transaction-form";

interface TransactionDialogContextValue {
  openCreate: (defaults?: Partial<TransactionFormInitial>) => void;
  openEdit: (tx: TransactionRow) => void;
  accounts: AccountOption[];
  categories: CategoryOption[];
}

const TransactionDialogContext = createContext<TransactionDialogContextValue | null>(null);

export function useTransactionDialog() {
  const ctx = useContext(TransactionDialogContext);
  if (!ctx) throw new Error("useTransactionDialog debe usarse dentro de TransactionDialogProvider");
  return ctx;
}

/**
 * Mantiene un único diálogo de "Añadir / editar movimiento" para toda la app.
 */
export function TransactionDialogProvider({
  accounts,
  categories,
  children,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<TransactionFormInitial | null>(null);
  // Cambiar la key reinicia el formulario en cada apertura.
  const [formKey, setFormKey] = useState(0);

  const openCreate = useCallback(
    (defaults?: Partial<TransactionFormInitial>) => {
      setInitial({
        type: "EXPENSE",
        amount: "",
        accountId: rememberedAccountId(accounts),
        date: toDateKey(new Date()),
        ...defaults,
      });
      setFormKey((k) => k + 1);
      setOpen(true);
    },
    [accounts],
  );

  const openEdit = useCallback((tx: TransactionRow) => {
    if (tx.type !== "INCOME" && tx.type !== "EXPENSE" && tx.type !== "TRANSFER") return;
    setInitial({
      id: tx.id,
      type: tx.type,
      amount: formatAmountInput(tx.amount, tx.account.currency),
      accountId: tx.account.id,
      toAccountId: tx.toAccount?.id,
      toAmount: tx.toAmount && tx.toAccount ? formatAmountInput(tx.toAmount, tx.toAccount.currency) : undefined,
      categoryId: tx.category?.id,
      date: toDateKey(tx.date),
      description: tx.description,
      note: tx.note ?? undefined,
    });
    setFormKey((k) => k + 1);
    setOpen(true);
  }, []);

  const editing = Boolean(initial?.id);

  return (
    <TransactionDialogContext.Provider value={{ openCreate, openEdit, accounts, categories }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar movimiento" : "Nuevo movimiento"}</DialogTitle>
            <DialogDescription className="sr-only">
              {editing ? "Modifica los datos del movimiento." : "Registra un ingreso, gasto o transferencia."}
            </DialogDescription>
          </DialogHeader>
          {initial && (
            <TransactionForm
              key={formKey}
              accounts={accounts}
              categories={categories}
              initial={initial}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </TransactionDialogContext.Provider>
  );
}

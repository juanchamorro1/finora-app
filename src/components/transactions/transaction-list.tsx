"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryIcon, SystemTransactionIcon } from "@/components/shared/category-icon";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Money } from "@/components/shared/money";
import { formatRelativeDay, toDateKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import {
  purgeTransactionAction,
  restoreTransactionAction,
  trashTransactionAction,
} from "@/server/actions/transactions";
import { TRANSACTION_TYPE_LABELS, type TransactionRow } from "@/types/finance";
import { useTransactionDialog } from "./transaction-dialog-provider";

function groupByDay(items: TransactionRow[]) {
  const groups: { key: string; date: Date; items: TransactionRow[] }[] = [];
  for (const tx of items) {
    const key = toDateKey(tx.date);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(tx);
    else groups.push({ key, date: tx.date, items: [tx] });
  }
  return groups;
}

/**
 * Lista de movimientos agrupada por día. Con `grouped={false}` muestra una
 * lista compacta (ej. "Últimos movimientos" del dashboard).
 */
export function TransactionList({
  items,
  grouped = true,
  trash = false,
  highlightAccountId,
}: {
  items: TransactionRow[];
  grouped?: boolean;
  trash?: boolean;
  /** Si se indica, las transferencias se muestran con signo según esta cuenta. */
  highlightAccountId?: string;
}) {
  if (!grouped) {
    return (
      <ul className="divide-y divide-border/60">
        {items.map((tx) => (
          <TransactionItem key={tx.id} tx={tx} trash={trash} showDate highlightAccountId={highlightAccountId} />
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {groupByDay(items).map((group) => (
        <section key={group.key} aria-label={formatRelativeDay(group.date)}>
          <h3 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {formatRelativeDay(group.date)}
          </h3>
          <ul className="divide-y divide-border/60">
            {group.items.map((tx) => (
              <TransactionItem key={tx.id} tx={tx} trash={trash} highlightAccountId={highlightAccountId} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TransactionItem({
  tx,
  trash,
  showDate,
  highlightAccountId,
}: {
  tx: TransactionRow;
  trash: boolean;
  showDate?: boolean;
  highlightAccountId?: string;
}) {
  const { openEdit } = useTransactionDialog();
  const [confirm, setConfirm] = useState<"trash" | "purge" | null>(null);
  const [pending, startTransition] = useTransition();
  const editable = !trash && (tx.type === "INCOME" || tx.type === "EXPENSE" || tx.type === "TRANSFER");

  let amount = tx.amount;
  let currency = tx.account.currency;
  let tone: "income" | "expense" | "default" = "default";
  if (tx.type === "INCOME") tone = "income";
  else if (tx.type === "EXPENSE") {
    tone = "expense";
    amount = -amount;
  } else if (tx.type === "TRANSFER" && tx.toAccount && highlightAccountId === tx.toAccount.id && tx.toAmount !== null) {
    amount = tx.toAmount;
    currency = tx.toAccount.currency;
  } else if (tx.type === "TRANSFER" && highlightAccountId === tx.account.id) {
    amount = -amount;
  }

  const subtitle =
    tx.type === "TRANSFER"
      ? `${tx.account.name} → ${tx.toAccount?.name}`
      : tx.category
        ? `${tx.category.name} · ${tx.account.name}`
        : `${TRANSACTION_TYPE_LABELS[tx.type]} · ${tx.account.name}`;

  async function moveToTrash() {
    const result = await trashTransactionAction(tx.id);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast("Movimiento enviado a la papelera", {
      action: {
        label: "Deshacer",
        onClick: async () => {
          const undo = await restoreTransactionAction(tx.id);
          if (!undo.ok) toast.error(undo.error);
        },
      },
    });
  }

  function restore() {
    startTransition(async () => {
      const result = await restoreTransactionAction(tx.id);
      if (result.ok) toast.success("Movimiento restaurado");
      else toast.error(result.error);
    });
  }

  async function purge() {
    const result = await purgeTransactionAction(tx.id);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success("Movimiento eliminado definitivamente");
  }

  return (
    <li className={cn("group flex items-center gap-3 py-3", pending && "opacity-50")}>
      <button
        type="button"
        disabled={!editable}
        onClick={() => editable && openEdit(tx)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
        aria-label={editable ? `Editar ${tx.description}` : undefined}
      >
        {tx.category ? (
          <CategoryIcon icon={tx.category.icon} color={tx.category.color} />
        ) : (
          <SystemTransactionIcon type={tx.type} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{tx.description}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {showDate && `${formatRelativeDay(tx.date)} · `}
            {subtitle}
            {tx.note && " · 📝"}
          </span>
        </span>
        <Money
          amount={amount}
          currency={currency}
          tone={tone === "income" ? "income" : "default"}
          signDisplay={tx.type === "INCOME" ? "always" : "auto"}
          className="text-sm font-medium"
        />
      </button>

      {(editable || trash) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[popup-open]:opacity-100"
                aria-label="Opciones del movimiento"
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {trash ? (
              <>
                <DropdownMenuItem onClick={restore}>
                  <RotateCcw /> Restaurar
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setConfirm("purge")}>
                  <Trash2 /> Eliminar definitivamente
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem onClick={() => openEdit(tx)}>
                  <Pencil /> Editar
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setConfirm("trash")}>
                  <Trash2 /> Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ConfirmDialog
        open={confirm === "trash"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="¿Eliminar este movimiento?"
        description={`"${tx.description}" se moverá a la papelera y dejará de afectar tus saldos. Podrás restaurarlo después.`}
        confirmLabel="Eliminar"
        onConfirm={moveToTrash}
      />
      <ConfirmDialog
        open={confirm === "purge"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="¿Eliminar definitivamente?"
        description={`"${tx.description}" se borrará para siempre. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar para siempre"
        onConfirm={purge}
      />
    </li>
  );
}

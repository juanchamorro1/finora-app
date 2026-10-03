"use client";

import Link from "next/link";
import { useState } from "react";
import { Banknote, Bitcoin, Building2, MoreHorizontal, Smartphone, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils";
import { deleteAccountAction, setAccountActiveAction } from "@/server/actions/accounts";
import { ACCOUNT_TYPE_LABELS, type AccountOption } from "@/types/finance";
import { EditAccountDialog } from "./account-dialogs";

const TYPE_ICONS = {
  BANK: Building2,
  DIGITAL_WALLET: Smartphone,
  CASH: Banknote,
  CRYPTO: Bitcoin,
  OTHER: Wallet,
};

export function AccountRow({
  account,
  transactionCount,
  balanceBase,
  openingBalance,
}: {
  account: AccountOption;
  transactionCount: number;
  /** Saldo inicial registrado (0 si no tiene). */
  openingBalance: bigint;
  /** Equivalente en COP para cuentas en otra moneda (null si falta tasa). */
  balanceBase: bigint | null;
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | "deactivate" | null>(null);
  const Icon = TYPE_ICONS[account.type];

  async function toggleActive() {
    const result = await setAccountActiveAction(account.id, !account.isActive);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success(account.isActive ? "Cuenta desactivada" : "Cuenta activada");
  }

  async function remove() {
    const result = await deleteAccountAction(account.id);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success("Cuenta eliminada");
  }

  return (
    <li className={cn("flex items-center gap-3 py-4", !account.isActive && "opacity-60")}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/movimientos?account=${account.id}`} className="truncate font-medium hover:underline">
            {account.name}
          </Link>
          {!account.isActive && <Badge variant="secondary">Inactiva</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {ACCOUNT_TYPE_LABELS[account.type]} · {account.currency} · {transactionCount}{" "}
          {transactionCount === 1 ? "movimiento" : "movimientos"}
        </p>
      </div>
      <div className="text-right">
        <Money amount={account.balance} currency={account.currency} tone={account.balance < 0n ? "expense" : "default"} className="font-medium" />
        {account.currency !== "COP" && (
          <p className="text-xs text-muted-foreground">
            {balanceBase !== null ? <>≈ <Money amount={balanceBase} /></> : "Sin tasa de cambio"}
          </p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Opciones de ${account.name}`} />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDialog("edit")}>Editar</DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/movimientos?account=${account.id}`} />}>Ver movimientos</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDialog("deactivate")}>
            {account.isActive ? "Desactivar" : "Activar"}
          </DropdownMenuItem>
          {transactionCount === 0 && (
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>
              Eliminar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "edit" && (
        <EditAccountDialog account={account} openingBalance={openingBalance} hasTransactions={transactionCount > 0} open onOpenChange={(o) => !o && setDialog(null)} />
      )}
      <ConfirmDialog
        open={dialog === "deactivate"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={account.isActive ? `¿Desactivar ${account.name}?` : `¿Activar ${account.name}?`}
        description={
          account.isActive
            ? "No podrás registrar movimientos nuevos en ella y su saldo dejará de sumar al total. Su historial se conserva."
            : "Volverá a sumar al total y podrás registrar movimientos."
        }
        confirmLabel={account.isActive ? "Desactivar" : "Activar"}
        destructive={account.isActive}
        onConfirm={toggleActive}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`¿Eliminar ${account.name}?`}
        description="La cuenta no tiene movimientos y se eliminará por completo."
        confirmLabel="Eliminar"
        onConfirm={remove}
      />
    </li>
  );
}

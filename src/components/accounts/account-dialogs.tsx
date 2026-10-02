"use client";

import { useState, useTransition, type ReactElement } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/shared/amount-input";
import type { FieldErrors } from "@/lib/action-result";
import { formatAmountInput, formatMoney } from "@/lib/money";
import { createAccountAction, reconcileAccountAction, updateAccountAction } from "@/server/actions/accounts";
import type { AccountOption } from "@/types/finance";
import { AccountFields, type AccountFieldValues } from "./account-fields";

export function CreateAccountDialog({ trigger }: { trigger: ReactElement }) {
  const empty: AccountFieldValues = { name: "", type: "BANK", currency: "COP", openingBalance: "" };
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createAccountAction(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      toast.success(`Cuenta "${values.name.trim()}" creada`);
      setValues(empty);
      setErrors({});
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva cuenta</DialogTitle>
          <DialogDescription>Un banco, billetera digital, efectivo o cualquier lugar donde tengas dinero.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-6"
        >
          <AccountFields values={values} onChange={setValues} errors={errors} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Creando…" : "Crear cuenta"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditAccountDialog({
  account,
  openingBalance,
  hasTransactions,
  open,
  onOpenChange,
}: {
  account: AccountOption;
  /** Saldo inicial actual de la cuenta. */
  openingBalance: bigint;
  hasTransactions: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const initialOpening = openingBalance === 0n ? "" : formatAmountInput(openingBalance, account.currency);
  // El campo solo admite montos positivos: un saldo inicial negativo (deuda) conserva su signo.
  const negativeOpening = openingBalance < 0n;
  const [values, setValues] = useState<AccountFieldValues>({
    name: account.name,
    type: account.type,
    currency: account.currency,
    openingBalance: initialOpening,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const opening = values.openingBalance && negativeOpening ? `-${values.openingBalance}` : values.openingBalance;
      const result = await updateAccountAction(account.id, {
        ...values,
        // Si no cambió, no se envía: así no se reescribe el saldo inicial.
        openingBalance: values.openingBalance === initialOpening && values.currency === account.currency ? undefined : opening,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      toast.success("Cuenta actualizada");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar cuenta</DialogTitle>
          <DialogDescription className="sr-only">Cambia el nombre, tipo, moneda o saldo inicial.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-6"
        >
          <AccountFields
            values={values}
            onChange={setValues}
            errors={errors}
            openingBalanceLabel={negativeOpening ? "Saldo inicial (negativo)" : "Saldo inicial"}
            openingBalanceHint="El saldo actual se recalcula con todos los movimientos. Para cuadrar con el banco usa Ajustar saldo."
            currencyLocked={hasTransactions}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Ajusta el saldo al valor real registrando un movimiento de ajuste (trazable). */
export function ReconcileDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AccountOption;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [value, setValue] = useState(formatAmountInput(account.balance, account.currency));
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await reconcileAccountAction(account.id, value);
      if (!result.ok) {
        setError(result.fieldErrors?.amount ?? result.fieldErrors?.actualBalance ?? result.error);
        return;
      }
      toast.success(result.data.adjusted ? "Saldo ajustado" : "El saldo ya coincidía");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajustar saldo de {account.name}</DialogTitle>
          <DialogDescription>
            Saldo en Finora: {formatMoney(account.balance, account.currency)}. Si tu saldo real es otro, se registrará
            un ajuste por la diferencia (no cuenta como ingreso ni gasto).
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-6"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reconcile-amount">Saldo real</Label>
            <AmountInput
              id="reconcile-amount"
              currency={account.currency}
              value={value}
              onChange={(v) => {
                setValue(v);
                setError(undefined);
              }}
              invalid={Boolean(error)}
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Ajustando…" : "Ajustar saldo"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

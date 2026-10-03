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
import type { FieldErrors } from "@/lib/action-result";
import { formatAmountInput, formatMoney, parseMoney } from "@/lib/money";
import { createAccountAction, updateAccountAction } from "@/server/actions/accounts";
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

  // Saldo que mostrará la cuenta con el saldo inicial escrito (el resto de movimientos no cambia).
  let preview: bigint | null = null;
  try {
    const typed = values.openingBalance ? parseMoney(values.openingBalance, values.currency) : 0n;
    preview = account.balance - openingBalance + (negativeOpening ? -typed : typed);
  } catch {
    preview = null;
  }

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
            openingBalanceWarning={
              preview === null ? (
                "El saldo que aparece en la cuenta es este saldo inicial más tus ingresos y menos tus gastos."
              ) : (
                <>
                  Con este saldo inicial, la cuenta va a mostrar{" "}
                  <strong className="font-semibold">{formatMoney(preview, values.currency)}</strong>
                  {hasTransactions ? " (saldo inicial + tus movimientos)." : "."}
                </>
              )
            }
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

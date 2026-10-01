"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmountInput } from "@/components/shared/amount-input";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/currency";
import type { FieldErrors } from "@/lib/action-result";
import { ACCOUNT_TYPE_LABELS } from "@/types/finance";
import type { AccountType } from "@/generated/prisma/enums";

export interface AccountFieldValues {
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: string;
}

const CURRENCY_ITEMS = Object.fromEntries(CURRENCY_CODES.map((c) => [c, `${c} · ${CURRENCIES[c].name}`]));

/** Campos de cuenta reutilizados en /cuentas y en la configuración inicial. */
export function AccountFields({
  values,
  onChange,
  errors = {},
  showOpeningBalance = true,
  currencyLocked = false,
  errorPrefix = "",
}: {
  values: AccountFieldValues;
  onChange: (values: AccountFieldValues) => void;
  errors?: FieldErrors;
  showOpeningBalance?: boolean;
  currencyLocked?: boolean;
  errorPrefix?: string;
}) {
  const set = <K extends keyof AccountFieldValues>(key: K, value: AccountFieldValues[K]) =>
    onChange({ ...values, [key]: value });
  const err = (key: string) => errors[`${errorPrefix}${key}`];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-name">Nombre</Label>
        <Input
          id="account-name"
          maxLength={40}
          placeholder="Ej. Bancolombia, Nequi, Efectivo"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          aria-invalid={Boolean(err("name")) || undefined}
        />
        {err("name") && <p className="text-sm text-destructive">{err("name")}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <Select items={ACCOUNT_TYPE_LABELS} value={values.type} onValueChange={(v) => v && set("type", v as AccountType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Moneda</Label>
          <Select
            items={CURRENCY_ITEMS}
            value={values.currency}
            disabled={currencyLocked}
            onValueChange={(v) => v && onChange({ ...values, currency: v, openingBalance: "" })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCY_CODES.map((c) => (
                <SelectItem key={c} value={c}>{CURRENCY_ITEMS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currencyLocked && (
            <p className="text-xs text-muted-foreground">No se puede cambiar porque la cuenta tiene movimientos.</p>
          )}
          {err("currency") && <p className="text-sm text-destructive">{err("currency")}</p>}
        </div>
      </div>
      {showOpeningBalance && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-opening">Saldo actual</Label>
          <AmountInput
            id="account-opening"
            currency={values.currency}
            value={values.openingBalance}
            onChange={(v) => set("openingBalance", v)}
            invalid={Boolean(err("openingBalance"))}
          />
          {err("openingBalance") ? (
            <p className="text-sm text-destructive">{err("openingBalance")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Se registra como saldo inicial: no cuenta como ingreso del mes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

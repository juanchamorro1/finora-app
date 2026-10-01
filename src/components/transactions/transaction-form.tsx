"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AmountInput } from "@/components/shared/amount-input";
import { CategoryIcon } from "@/components/shared/category-icon";
import { formatMoney } from "@/lib/money";
import { toDateKey, addDays } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { FieldErrors } from "@/lib/action-result";
import type { TransactionFormValues } from "@/lib/validation";
import { createTransactionAction, updateTransactionAction } from "@/server/actions/transactions";
import type { AccountOption, CategoryOption } from "@/types/finance";

type FormType = "EXPENSE" | "INCOME" | "TRANSFER";

export interface TransactionFormInitial {
  id?: string;
  type: FormType;
  amount: string;
  accountId: string;
  toAccountId?: string;
  toAmount?: string;
  categoryId?: string;
  date: string;
  description?: string;
  note?: string;
}

const TYPE_OPTIONS: { value: FormType; label: string }[] = [
  { value: "EXPENSE", label: "Gasto" },
  { value: "INCOME", label: "Ingreso" },
  { value: "TRANSFER", label: "Transferencia" },
];

const LAST_ACCOUNT_KEY = "finora:last-account";

export function rememberedAccountId(accounts: AccountOption[]): string {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    // almacenamiento no disponible: se usa la primera cuenta
  }
  const active = accounts.filter((a) => a.isActive);
  return active.find((a) => a.id === saved)?.id ?? active[0]?.id ?? "";
}

export function TransactionForm({
  accounts,
  categories,
  initial,
  onDone,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  initial: TransactionFormInitial;
  onDone: () => void;
}) {
  const editing = Boolean(initial.id);
  const [values, setValues] = useState<TransactionFormInitial>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [showNote, setShowNote] = useState(Boolean(initial.note));
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof TransactionFormInitial>(key: K, value: TransactionFormInitial[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined as unknown as string }));
  };

  // Al editar se permite ver cuentas/categorías inactivas si el movimiento ya las usa.
  const selectableAccounts = accounts.filter(
    (a) => a.isActive || a.id === initial.accountId || a.id === initial.toAccountId,
  );
  const account = accounts.find((a) => a.id === values.accountId);
  const toAccount = accounts.find((a) => a.id === values.toAccountId);
  const currency = account?.currency ?? "COP";
  const crossCurrency = values.type === "TRANSFER" && account && toAccount && account.currency !== toAccount.currency;
  const kindCategories = useMemo(
    () =>
      categories.filter(
        (c) => c.kind === values.type && (!c.isArchived || c.id === initial.categoryId),
      ),
    [categories, values.type, initial.categoryId],
  );

  const accountItems = Object.fromEntries(selectableAccounts.map((a) => [a.id, a.name]));
  const today = toDateKey(new Date());
  const yesterday = toDateKey(addDays(new Date(), -1));

  function changeType(type: FormType) {
    setValues((v) => ({
      ...v,
      type,
      categoryId: categories.some((c) => c.id === v.categoryId && c.kind === type) ? v.categoryId : undefined,
      toAccountId: type === "TRANSFER" ? v.toAccountId : undefined,
    }));
    setErrors({});
  }

  function submit(addAnother: boolean) {
    const payload: TransactionFormValues = {
      type: values.type,
      amount: values.amount,
      accountId: values.accountId,
      toAccountId: values.type === "TRANSFER" ? values.toAccountId : null,
      toAmount: crossCurrency ? values.toAmount : null,
      categoryId: values.type === "TRANSFER" ? null : values.categoryId,
      date: values.date,
      description: values.description,
      note: showNote ? values.note : null,
    };
    startTransition(async () => {
      const result = editing
        ? await updateTransactionAction(initial.id!, payload)
        : await createTransactionAction(payload);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      try {
        window.localStorage.setItem(LAST_ACCOUNT_KEY, values.accountId);
      } catch {
        // sin almacenamiento local: no pasa nada
      }
      const label = TYPE_OPTIONS.find((t) => t.value === values.type)!.label.toLowerCase();
      toast.success(editing ? "Movimiento actualizado" : `${label[0].toUpperCase()}${label.slice(1)} registrado`);
      if (addAnother) {
        setValues((v) => ({ ...v, amount: "", description: "", note: "" }));
        setShowNote(false);
        document.getElementById("tx-amount")?.focus();
      } else {
        onDone();
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      noValidate
    >
      {/* Tipo */}
      <div role="radiogroup" aria-label="Tipo de movimiento" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={values.type === opt.value}
            onClick={() => changeType(opt.value)}
            className={cn(
              "rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
              values.type === opt.value && "bg-background text-foreground shadow-sm",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Monto */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tx-amount">Monto</Label>
        <AmountInput
          id="tx-amount"
          size="lg"
          autoFocus
          currency={currency}
          value={values.amount}
          onChange={(v) => set("amount", v)}
          invalid={Boolean(errors.amount)}
        />
        <FieldMessage error={errors.amount} />
      </div>

      {/* Cuentas */}
      <div className={cn("grid gap-3", values.type === "TRANSFER" && "sm:grid-cols-2")}>
        <div className="flex flex-col gap-1.5">
          <Label>{values.type === "TRANSFER" ? "Desde" : "Cuenta"}</Label>
          <Select items={accountItems} value={values.accountId || null} onValueChange={(v) => set("accountId", v ?? "")}>
            <SelectTrigger className="w-full" aria-invalid={Boolean(errors.accountId) || undefined}>
              <SelectValue placeholder="Selecciona una cuenta" />
            </SelectTrigger>
            <SelectContent>
              {selectableAccounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex-1">{a.name}</span>
                  <span className="tabular text-xs text-muted-foreground">{formatMoney(a.balance, a.currency)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldMessage error={errors.accountId} />
        </div>
        {values.type === "TRANSFER" && (
          <div className="flex flex-col gap-1.5">
            <Label>Hacia</Label>
            <Select
              items={accountItems}
              value={values.toAccountId || null}
              onValueChange={(v) => set("toAccountId", v ?? undefined)}
            >
              <SelectTrigger className="w-full" aria-invalid={Boolean(errors.toAccountId) || undefined}>
                <SelectValue placeholder="Cuenta destino" />
              </SelectTrigger>
              <SelectContent>
                {selectableAccounts
                  .filter((a) => a.id !== values.accountId)
                  .map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex-1">{a.name}</span>
                      <span className="text-xs text-muted-foreground">{a.currency}</span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <FieldMessage error={errors.toAccountId} />
          </div>
        )}
      </div>

      {crossCurrency && toAccount && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tx-to-amount">Monto recibido en {toAccount.name}</Label>
          <AmountInput
            id="tx-to-amount"
            currency={toAccount.currency}
            value={values.toAmount ?? ""}
            onChange={(v) => set("toAmount", v)}
            invalid={Boolean(errors.toAmount)}
          />
          <FieldMessage error={errors.toAmount} hint="Las cuentas usan monedas distintas." />
        </div>
      )}

      {/* Categoría */}
      {values.type !== "TRANSFER" && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">Categoría</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Categoría">
            {kindCategories.map((c) => {
              const selected = values.categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => set("categoryId", c.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <CategoryIcon icon={c.icon} color={selected ? "currentColor" : c.color} size="sm" className="size-6" />
                  {c.name}
                </button>
              );
            })}
          </div>
          {kindCategories.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay categorías. Créalas en Ajustes.</p>
          )}
          <FieldMessage error={errors.categoryId} />
        </fieldset>
      )}

      {/* Fecha y descripción */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="tx-date">Fecha</Label>
            <div className="flex gap-2 text-xs">
              <button type="button" className={cn("text-muted-foreground hover:text-foreground", values.date === today && "text-foreground font-medium")} onClick={() => set("date", today)}>Hoy</button>
              <button type="button" className={cn("text-muted-foreground hover:text-foreground", values.date === yesterday && "text-foreground font-medium")} onClick={() => set("date", yesterday)}>Ayer</button>
            </div>
          </div>
          <Input
            id="tx-date"
            type="date"
            value={values.date}
            onChange={(e) => set("date", e.target.value)}
            aria-invalid={Boolean(errors.date) || undefined}
          />
          <FieldMessage error={errors.date} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tx-description">
            Descripción <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id="tx-description"
            maxLength={120}
            placeholder={values.type === "TRANSFER" ? "Ej. Recarga Nequi" : "Ej. Almuerzo"}
            value={values.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            aria-invalid={Boolean(errors.description) || undefined}
          />
          <FieldMessage error={errors.description} />
        </div>
      </div>

      {showNote ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tx-note">Nota</Label>
          <Textarea
            id="tx-note"
            maxLength={500}
            rows={2}
            value={values.note ?? ""}
            onChange={(e) => set("note", e.target.value)}
          />
          <FieldMessage error={errors.note} />
        </div>
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="self-start text-sm text-muted-foreground hover:text-foreground">
          + Añadir nota
        </button>
      )}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        {!editing && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => submit(true)}>
            Guardar y añadir otro
          </Button>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : editing ? "Guardar cambios" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}

function FieldMessage({ error, hint }: { error?: string; hint?: string }) {
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (hint) return <p className="text-xs text-muted-foreground">{hint}</p>;
  return null;
}

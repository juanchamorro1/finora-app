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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmountInput } from "@/components/shared/amount-input";
import type { FieldErrors } from "@/lib/action-result";
import { formatMoney } from "@/lib/money";
import { addContributionAction, createGoalAction, updateGoalAction } from "@/server/actions/goals";

export interface GoalFormValues {
  name: string;
  targetAmount: string;
  initialSaved: string;
  targetDate: string;
  accountId: string;
}

export function GoalDialog({
  trigger,
  accounts,
  goalId,
  initial,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: ReactElement;
  accounts: { id: string; name: string }[];
  /** Si se indica, edita la meta. */
  goalId?: string;
  initial?: GoalFormValues;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const empty: GoalFormValues = { name: "", targetAmount: "", initialSaved: "", targetDate: "", accountId: "" };
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [values, setValues] = useState(initial ?? empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof GoalFormValues>(k: K, v: GoalFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));
  const accountItems = { none: "Sin cuenta", ...Object.fromEntries(accounts.map((a) => [a.id, a.name])) };

  function submit() {
    startTransition(async () => {
      const payload = { ...values, accountId: values.accountId || null };
      const result = goalId ? await updateGoalAction(goalId, payload) : await createGoalAction(payload);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      toast.success(goalId ? "Meta actualizada" : "Meta creada");
      setOpen(false);
      if (!goalId) setValues(empty);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{goalId ? "Editar meta" : "Nueva meta de ahorro"}</DialogTitle>
          <DialogDescription>El dinero de las metas se aparta: tus saldos no cambian.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-name">Nombre</Label>
            <Input id="goal-name" maxLength={60} placeholder="Ej. PC nueva" value={values.name} onChange={(e) => set("name", e.target.value)} aria-invalid={Boolean(errors.name) || undefined} />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-target">Objetivo</Label>
              <AmountInput id="goal-target" currency="COP" value={values.targetAmount} onChange={(v) => set("targetAmount", v)} invalid={Boolean(errors.targetAmount)} />
              {errors.targetAmount && <p className="text-sm text-destructive">{errors.targetAmount}</p>}
            </div>
            {!goalId && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="goal-saved">Ya ahorrado <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <AmountInput id="goal-saved" currency="COP" value={values.initialSaved} onChange={(v) => set("initialSaved", v)} invalid={Boolean(errors.initialSaved)} />
                {errors.initialSaved && <p className="text-sm text-destructive">{errors.initialSaved}</p>}
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-date">Fecha objetivo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="goal-date" type="date" value={values.targetDate} onChange={(e) => set("targetDate", e.target.value)} />
              {errors.targetDate && <p className="text-sm text-destructive">{errors.targetDate}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Cuenta <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Select items={accountItems} value={values.accountId || "none"} onValueChange={(v) => set("accountId", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(accountItems).map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : goalId ? "Guardar" : "Crear meta"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ContributionDialog({
  goal,
  direction,
  open,
  onOpenChange,
}: {
  goal: { id: string; name: string; saved: bigint; remaining: bigint };
  direction: "add" | "withdraw";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addContributionAction({ goalId: goal.id, amount, direction, note: note || undefined });
      if (!result.ok) {
        setError(result.fieldErrors?.amount ?? result.error);
        return;
      }
      toast.success(
        result.data.completed && direction === "add"
          ? `¡Completaste la meta "${goal.name}"! 🎉`
          : direction === "add"
            ? "Aporte registrado"
            : "Retiro registrado",
      );
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{direction === "add" ? `Aportar a ${goal.name}` : `Retirar de ${goal.name}`}</DialogTitle>
          <DialogDescription>
            {direction === "add"
              ? `Faltan ${formatMoney(goal.remaining)}. Es dinero apartado: no se descuenta de tus cuentas.`
              : `Tienes ${formatMoney(goal.saved)} apartados en esta meta.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contribution-amount">Monto</Label>
            <AmountInput id="contribution-amount" currency="COP" value={amount} onChange={(v) => { setAmount(v); setError(undefined); }} invalid={Boolean(error)} autoFocus />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contribution-note">Nota <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Input id="contribution-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>{pending ? "Guardando…" : direction === "add" ? "Aportar" : "Retirar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

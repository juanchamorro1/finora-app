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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmountInput } from "@/components/shared/amount-input";
import type { FieldErrors } from "@/lib/action-result";
import { setBudgetAction } from "@/server/actions/budgets";

/** Crear (eligiendo categoría) o editar (categoría fija) un presupuesto mensual. */
export function BudgetDialog({
  trigger,
  categories,
  initial,
  open: controlledOpen,
  onOpenChange,
}: {
  trigger?: ReactElement;
  /** Categorías de gasto disponibles (sin presupuesto) al crear. */
  categories: { id: string; name: string }[];
  initial?: { categoryId: string; categoryName: string; amount: string };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();
  const items = Object.fromEntries(categories.map((c) => [c.id, c.name]));

  function submit() {
    startTransition(async () => {
      const result = await setBudgetAction({ categoryId, amount });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (!result.fieldErrors) toast.error(result.error);
        return;
      }
      toast.success(initial ? "Presupuesto actualizado" : "Presupuesto creado");
      setOpen(false);
      if (!initial) {
        setCategoryId("");
        setAmount("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? `Presupuesto de ${initial.categoryName}` : "Nuevo presupuesto"}</DialogTitle>
          <DialogDescription>Límite de gasto mensual. Se renueva automáticamente cada mes.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {!initial && (
            <div className="flex flex-col gap-1.5">
              <Label>Categoría</Label>
              {categories.length > 0 ? (
                <Select items={items} value={categoryId || null} onValueChange={(v) => setCategoryId(v ?? "")}>
                  <SelectTrigger className="w-full" aria-invalid={Boolean(errors.categoryId) || undefined}>
                    <SelectValue placeholder="Selecciona una categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">Todas tus categorías de gasto ya tienen presupuesto.</p>
              )}
              {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId}</p>}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-amount">Monto mensual</Label>
            <AmountInput id="budget-amount" currency="COP" value={amount} onChange={setAmount} invalid={Boolean(errors.amount)} autoFocus={Boolean(initial)} />
            {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || (!initial && categories.length === 0)}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

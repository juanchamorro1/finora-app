"use client";

import { useState } from "react";
import { AlertTriangle, CircleAlert, MoreHorizontal, OctagonAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ProgressBar } from "@/components/goals/goal-progress-bar";
import { CategoryIcon } from "@/components/shared/category-icon";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Money } from "@/components/shared/money";
import { formatAmountInput, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteBudgetAction } from "@/server/actions/budgets";
import type { BudgetStatus } from "@/server/services/budgets";
import { BudgetDialog } from "./budget-dialog";

/** Alerta visual con icono + texto (nunca solo color). */
export function BudgetAlert({ status }: { status: Pick<BudgetStatus, "level" | "remaining" | "percent"> }) {
  if (status.level === "ok") return null;
  const config = {
    warning: { icon: CircleAlert, text: "Más del 75 % usado", className: "text-warning" },
    critical: { icon: AlertTriangle, text: "Más del 90 % usado", className: "text-expense" },
    over: { icon: OctagonAlert, text: `Excedido por ${formatMoney(-status.remaining)}`, className: "text-expense font-medium" },
  }[status.level];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", config.className)}>
      <config.icon className="size-3.5" aria-hidden />
      {config.text}
    </span>
  );
}

export function BudgetRow({ budget, editable = true }: { budget: BudgetStatus; editable?: boolean }) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);

  async function remove() {
    const result = await deleteBudgetAction(budget.id);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success("Presupuesto eliminado");
  }

  return (
    <li className="flex items-start gap-3 py-4">
      <CategoryIcon icon={budget.category.icon} color={budget.category.color} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="font-medium">{budget.category.name}</span>
          <span className="tabular text-sm">
            <Money amount={budget.spent} /> <span className="text-muted-foreground">de <Money amount={budget.amount} /></span>
          </span>
        </div>
        <ProgressBar
          className="mt-2"
          percent={budget.percent}
          tone={budget.level === "ok" ? "default" : budget.level}
          label={`${budget.category.name}: ${budget.percent} % usado`}
        />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="tabular">
            {budget.remaining >= 0n ? <>Quedan <Money amount={budget.remaining} /></> : "Sin margen"} ·{" "}
            {budget.percent.toLocaleString("es-CO")} %
          </span>
          <BudgetAlert status={budget} />
        </div>
      </div>
      {editable && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Opciones del presupuesto ${budget.category.name}`} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setDialog("edit")}>Editar monto</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>Eliminar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {dialog === "edit" && (
        <BudgetDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          categories={[]}
          initial={{ categoryId: budget.category.id, categoryName: budget.category.name, amount: formatAmountInput(budget.amount) }}
        />
      )}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`¿Eliminar el presupuesto de ${budget.category.name}?`}
        description="Tus movimientos no se modifican; solo dejarás de ver el límite mensual."
        confirmLabel="Eliminar"
        onConfirm={remove}
      />
    </li>
  );
}

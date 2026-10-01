"use client";

import { useState } from "react";
import { CalendarClock, ChevronDown, MoreHorizontal, Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Money } from "@/components/shared/money";
import { formatDate, formatRelativeDay, toDateKey } from "@/lib/dates";
import { formatAmountInput, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deleteGoalAction, setGoalArchivedAction } from "@/server/actions/goals";
import type { GoalProgress } from "@/server/services/goals";
import { ProgressBar } from "./goal-progress-bar";
import { ContributionDialog, GoalDialog } from "./goal-dialogs";

function timeLeftLabel(days: number): string {
  if (days < 0) return `Venció hace ${Math.abs(days)} ${Math.abs(days) === 1 ? "día" : "días"}`;
  if (days === 0) return "Vence hoy";
  if (days < 60) return `Quedan ${days} ${days === 1 ? "día" : "días"}`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `Quedan ~${months} meses`;
  return `Quedan ~${(days / 365).toFixed(1).replace(".", ",")} años`;
}

export function GoalItem({ goal, accounts }: { goal: GoalProgress; accounts: { id: string; name: string }[] }) {
  const [dialog, setDialog] = useState<"add" | "withdraw" | "edit" | "delete" | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const archived = goal.status === "ARCHIVED";
  const completed = goal.status === "COMPLETED";

  async function toggleArchive() {
    const result = await setGoalArchivedAction(goal.id, !archived);
    if (!result.ok) toast.error(result.error);
    else toast.success(archived ? "Meta restaurada" : "Meta archivada");
  }

  async function remove() {
    const result = await deleteGoalAction(goal.id);
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success("Meta eliminada");
  }

  return (
    <li className={cn("py-6", archived && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium">{goal.name}</h3>
            {completed && <Badge className="bg-income/15 text-income">Completada</Badge>}
            {archived && <Badge variant="secondary">Archivada</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <Money amount={goal.saved} className="font-medium text-foreground" /> de <Money amount={goal.targetAmount} />
            {goal.account && ` · en ${goal.account.name}`}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!archived && !completed && (
            <Button size="sm" variant="outline" onClick={() => setDialog("add")}>
              <Plus /> Aportar
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Opciones de ${goal.name}`} />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!archived && completed && <DropdownMenuItem onClick={() => setDialog("add")}>Aportar</DropdownMenuItem>}
              {!archived && goal.saved > 0n && <DropdownMenuItem onClick={() => setDialog("withdraw")}>Retirar</DropdownMenuItem>}
              {!archived && <DropdownMenuItem onClick={() => setDialog("edit")}>Editar</DropdownMenuItem>}
              <DropdownMenuItem onClick={toggleArchive}>{archived ? "Restaurar" : "Archivar"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")}>Eliminar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ProgressBar className="mt-4 h-2" percent={goal.percent} tone="income" label={`Progreso de ${goal.name}`} />

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Completado</dt>
          <dd className="tabular font-medium">{goal.percent.toLocaleString("es-CO")} %</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Falta</dt>
          <dd className="font-medium"><Money amount={goal.remaining} /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Tiempo</dt>
          <dd className="font-medium">
            {goal.targetDate && goal.daysLeft !== null ? (
              <span title={formatDate(goal.targetDate)}>{completed ? formatDate(goal.targetDate) : timeLeftLabel(goal.daysLeft)}</span>
            ) : (
              <span className="text-muted-foreground">Sin fecha</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Ritmo necesario</dt>
          <dd className="font-medium">
            {goal.requiredPerMonth !== null ? (
              <>
                <Money amount={goal.requiredPerMonth} />
                <span className="text-xs font-normal text-muted-foreground"> /mes</span>
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
        </div>
      </dl>

      {!completed && !archived && (goal.requiredPerWeek !== null || goal.projectedDate) && (
        <ul className="mt-4 flex flex-col gap-1.5 text-xs text-muted-foreground">
          {goal.requiredPerWeek !== null && goal.targetDate && (
            <li className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" aria-hidden />
              Para llegar al {formatDate(goal.targetDate)} necesitas apartar {formatMoney(goal.requiredPerWeek)} por semana.
            </li>
          )}
          {goal.projectedDate && (
            <li className="flex items-center gap-1.5">
              <TrendingUp className="size-3.5" aria-hidden />
              Al ritmo de los últimos 3 meses ({formatMoney(goal.recentMonthlyPace)}/mes) la completarías hacia el{" "}
              {formatDate(goal.projectedDate)}
              {goal.targetDate && goal.projectedDate > goal.targetDate && " — después de tu fecha objetivo"}.
            </li>
          )}
        </ul>
      )}

      {goal.contributions.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={showHistory}
          >
            <ChevronDown className={cn("size-3.5 transition-transform", showHistory && "rotate-180")} />
            Historial ({goal.contributions.length})
          </button>
          {showHistory && (
            <ul className="mt-2 divide-y divide-border/60 text-sm">
              {goal.contributions.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-muted-foreground">
                    {formatRelativeDay(c.date)}
                    {c.note && ` · ${c.note}`}
                  </span>
                  <Money amount={c.amount} signDisplay="always" tone={c.amount < 0n ? "expense" : "income"} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {(dialog === "add" || dialog === "withdraw") && (
        <ContributionDialog goal={goal} direction={dialog} open onOpenChange={(o) => !o && setDialog(null)} />
      )}
      {dialog === "edit" && (
        <GoalDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          accounts={accounts}
          goalId={goal.id}
          initial={{
            name: goal.name,
            targetAmount: formatAmountInput(goal.targetAmount),
            initialSaved: "",
            targetDate: goal.targetDate ? toDateKey(goal.targetDate) : "",
            accountId: goal.account?.id ?? "",
          }}
        />
      )}
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`¿Eliminar la meta "${goal.name}"?`}
        description="Se borrará la meta y su historial de aportes. Tus cuentas no se modifican. Si solo quieres ocultarla, archívala."
        confirmLabel="Eliminar meta"
        onConfirm={remove}
      />
    </li>
  );
}

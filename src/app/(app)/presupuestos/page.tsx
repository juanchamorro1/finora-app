import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, PiggyBank, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { BudgetDialog } from "@/components/budgets/budget-dialog";
import { BudgetRow } from "@/components/budgets/budget-row";
import { ProgressBar } from "@/components/goals/goal-progress-bar";
import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { formatMonth, localParts, monthRange } from "@/lib/dates";
import { percentOf } from "@/lib/money";
import { requirePageUser } from "@/server/auth/guard";
import { db } from "@/server/db";
import { byCategory, loadFlows } from "@/server/services/analytics";
import { budgetLevel, getBudgetSummary } from "@/server/services/budgets";
import { listCategories } from "@/server/services/categories";

export const metadata: Metadata = { title: "Presupuestos" };

function parseMonth(value: string | string[] | undefined, now: Date) {
  const m = typeof value === "string" ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return { year: Number(m[1]), month: Number(m[2]) };
  const p = localParts(now);
  return { year: p.year, month: p.month };
}

const key = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default async function BudgetsPage({ searchParams }: PageProps<"/presupuestos">) {
  const user = await requirePageUser();
  const now = new Date();
  const { year, month } = parseMonth((await searchParams).mes, now);
  const current = localParts(now);
  const isCurrent = year === current.year && month === current.month;
  const range = monthRange(year, month);

  const [{ flows }, expenseCategories] = await Promise.all([
    loadFlows(db, user.id, range),
    listCategories(db, user.id, { kind: "EXPENSE" }),
  ]);
  const summary = await getBudgetSummary(db, user.id, flows);
  const budgeted = new Set(summary.budgets.map((b) => b.category.id));
  const available = expenseCategories.filter((c) => !budgeted.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
  const unbudgetedSpending = byCategory(flows, "EXPENSE").filter((c) => !budgeted.has(c.categoryId));
  const overallPercent = percentOf(summary.totalSpent, summary.totalBudget);
  const overallLevel = budgetLevel(summary.totalSpent, summary.totalBudget);

  return (
    <>
      <PageHeader
        title="Presupuestos"
        description="Límites mensuales por categoría."
        actions={
          <BudgetDialog categories={available} trigger={<Button><Plus /> Nuevo presupuesto</Button>} />
        }
      />

      <nav className="mb-8 flex items-center gap-1" aria-label="Mes">
        <Button variant="ghost" size="icon-sm" render={<Link href={`/presupuestos?mes=${key(year, month - 1)}`} aria-label="Mes anterior" />} nativeButton={false}>
          <ChevronLeft />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase">{formatMonth(range.from)}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={isCurrent}
          render={isCurrent ? undefined : <Link href={`/presupuestos?mes=${key(year, month + 1)}`} aria-label="Mes siguiente" />}
          nativeButton={isCurrent}
        >
          <ChevronRight />
        </Button>
        {!isCurrent && (
          <Link href="/presupuestos" className="ml-2 text-xs text-muted-foreground hover:text-foreground">
            Volver al mes actual
          </Link>
        )}
      </nav>

      {summary.budgets.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><PiggyBank /></EmptyMedia>
            <EmptyTitle>Sin presupuestos</EmptyTitle>
            <EmptyDescription>Define cuánto quieres gastar al mes en cada categoría y Finora te avisará al 75 %, 90 % y 100 %.</EmptyDescription>
          </EmptyHeader>
          <BudgetDialog categories={available} trigger={<Button variant="outline"><Plus /> Crear el primero</Button>} />
        </Empty>
      ) : (
        <>
          <section className="mb-10 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Presupuestado</p>
              <Money amount={summary.totalBudget} className="text-xl font-semibold tracking-tight" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gastado</p>
              <Money amount={summary.totalSpent} className="text-xl font-semibold tracking-tight" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{summary.totalRemaining < 0n ? "Excedido" : isCurrent ? "Disponible" : "Sobró"}</p>
              <Money amount={summary.totalRemaining < 0n ? -summary.totalRemaining : summary.totalRemaining} tone={summary.totalRemaining < 0n ? "expense" : "default"} className="text-xl font-semibold tracking-tight" />
              {summary.overCount > 0 && (
                <p className="mt-0.5 text-xs text-muted-foreground">{summary.overCount} {summary.overCount === 1 ? "categoría excedida" : "categorías excedidas"}</p>
              )}
            </div>
            <div className="sm:col-span-3">
              <ProgressBar percent={overallPercent} tone={overallLevel === "ok" ? "default" : overallLevel} label="Uso total del presupuesto" />
              <p className="mt-1.5 text-xs text-muted-foreground">{overallPercent.toLocaleString("es-CO")} % del total usado</p>
            </div>
          </section>

          <section>
            <SectionHeader title="Por categoría" />
            <ul className="divide-y divide-border/60">
              {summary.budgets.map((b) => (
                <BudgetRow key={b.id} budget={b} />
              ))}
            </ul>
          </section>
        </>
      )}

      {unbudgetedSpending.length > 0 && (
        <section className="mt-12">
          <SectionHeader title="Gastos sin presupuesto este mes" />
          <ul className="divide-y divide-border/60">
            {unbudgetedSpending.map((c) => (
              <li key={c.categoryId} className="flex items-center gap-3 py-3">
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="flex-1 text-sm">{c.name}</span>
                <Money amount={c.total} className="text-sm" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

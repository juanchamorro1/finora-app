import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateAccountDialog } from "@/components/accounts/account-dialogs";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { ProgressBar } from "@/components/goals/goal-progress-bar";
import { Money } from "@/components/shared/money";
import { SectionHeader } from "@/components/shared/page-header";
import { AddTransactionButton } from "@/components/transactions/add-transaction-button";
import { TransactionList } from "@/components/transactions/transaction-list";
import { formatMonth, formatMonthKeyShort } from "@/lib/dates";
import { formatMoney, percentOf } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/guard";
import { db } from "@/server/db";
import { toTransactionRow } from "@/server/mappers";
import { getDashboard } from "@/server/services/dashboard";

export default async function DashboardPage() {
  const user = await requirePageUser();
  const d = await getDashboard(db, user.id);
  const hasMovements = d.recent.length > 0;
  const chartHasData = d.chart.some((p) => p.income > 0n || p.expense > 0n);

  return (
    <div className="flex flex-col gap-12">
      {/* Encabezado + dinero total */}
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-sm text-muted-foreground">Dinero total</p>
          <Money amount={d.netWorth.totalBase} className="block text-4xl font-semibold tracking-tight sm:text-5xl" />
          {d.netWorth.byCurrency.length > 1 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {d.netWorth.byCurrency.map((c) => formatMoney(c.total, c.currency)).join(" · ")}
            </p>
          )}
          {d.netWorth.missingRates.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Sin incluir {d.netWorth.missingRates.join(", ")} —{" "}
              <Link href="/ajustes" className="underline underline-offset-2">define la tasa de cambio</Link>
            </p>
          )}
        </div>
        <CreateAccountDialog
          trigger={
            <Button variant="outline" size="sm">
              <Plus /> Agregar cuenta
            </Button>
          }
        />
      </section>

      {/* Resumen del mes */}
      <section aria-labelledby="month-summary">
        <h2 id="month-summary" className="mb-4 text-sm font-medium text-muted-foreground first-letter:uppercase">
          {formatMonth(new Date())}
        </h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 sm:divide-x sm:divide-border/60">
          <Stat label="Ingresos" className="sm:pr-6">
            <Money amount={d.month.income} tone="income" />
          </Stat>
          <Stat label="Gastos" className="sm:px-6">
            <Money amount={d.month.expense} />
          </Stat>
          <Stat label="Ahorro" className="sm:px-6" hint={d.month.income > 0n ? `${percentOf(d.month.net, d.month.income).toLocaleString("es-CO")} % de tus ingresos` : undefined}>
            <Money amount={d.month.net} tone={d.month.net < 0n ? "expense" : "default"} />
          </Stat>
          <Stat
            label="Presupuesto restante"
            className="sm:pl-6"
            hint={
              d.budgets.budgets.length > 0
                ? `de ${formatMoney(d.budgets.totalBudget)}${d.budgets.overCount > 0 ? ` · ${d.budgets.overCount} excedido${d.budgets.overCount > 1 ? "s" : ""}` : ""}`
                : undefined
            }
          >
            {d.budgets.budgets.length > 0 ? (
              <Money amount={d.budgets.totalRemaining} tone={d.budgets.totalRemaining < 0n ? "expense" : "default"} />
            ) : (
              <Link href="/presupuestos" className="text-base font-normal text-muted-foreground underline-offset-2 hover:underline">
                Crear presupuesto
              </Link>
            )}
          </Stat>
        </dl>
      </section>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* Evolución */}
        <section aria-labelledby="chart-title">
          <SectionHeader title="Ingresos y gastos · últimos 6 meses" />
          <h2 id="chart-title" className="sr-only">Ingresos y gastos de los últimos 6 meses</h2>
          {chartHasData ? (
            <IncomeExpenseChart
              data={d.chart.map((p) => ({
                label: formatMonthKeyShort(p.month),
                income: Number(p.income),
                expense: Number(p.expense),
              }))}
            />
          ) : (
            <p className="flex h-60 items-center justify-center rounded-xl bg-muted/40 text-sm text-muted-foreground">
              El gráfico aparecerá cuando registres ingresos o gastos.
            </p>
          )}
        </section>

        {/* Metas */}
        <section>
          <SectionHeader
            title="Metas"
            action={
              <Link href="/metas" className="text-xs text-muted-foreground hover:text-foreground">
                Ver todas
              </Link>
            }
          />
          {d.goals.length > 0 ? (
            <ul className="flex flex-col gap-5">
              {d.goals.map((g) => (
                <li key={g.id}>
                  <Link href="/metas" className="group block">
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium group-hover:underline">{g.name}</span>
                      <span className="tabular text-xs text-muted-foreground">{g.percent.toLocaleString("es-CO")} %</span>
                    </div>
                    <ProgressBar percent={g.percent} tone="income" label={`Progreso de ${g.name}`} />
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      <Money amount={g.saved} /> de <Money amount={g.targetAmount} />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {d.completedGoals > 0 ? "¡Completaste todas tus metas! " : "Aún no tienes metas. "}
              <Link href="/metas" className="text-foreground underline-offset-2 hover:underline">
                Crear una
              </Link>
            </p>
          )}
        </section>
      </div>

      {/* Últimos movimientos */}
      <section>
        <SectionHeader
          title="Últimos movimientos"
          action={
            hasMovements && (
              <Link href="/movimientos" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                Ver todos <ArrowRight className="size-3" />
              </Link>
            )
          }
        />
        {hasMovements ? (
          <TransactionList items={d.recent.map(toTransactionRow)} grouped={false} />
        ) : (
          <div className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-muted-foreground">Aún no hay movimientos. Registra tu primer gasto o ingreso.</p>
            <AddTransactionButton variant="outline" />
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-xl font-semibold tracking-tight">{children}</dd>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

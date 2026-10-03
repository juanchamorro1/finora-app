import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight } from "lucide-react";
import { CategoryBreakdown } from "@/components/charts/category-breakdown";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { PeriodSelector } from "@/components/charts/period-selector";
import { SingleBarChart, SingleLineChart } from "@/components/charts/simple-charts";
import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { addDays, formatDate, formatMonthKeyShort, formatShortDate, dateKeyToStartOfDay, toDateKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requirePageUser } from "@/server/auth/guard";
import { db } from "@/server/db";
import { parsePeriodParams } from "@/server/period-params";
import { getStatistics } from "@/server/services/statistics";

export const metadata: Metadata = { title: "Estadísticas" };

export default async function StatisticsPage({ searchParams }: PageProps<"/estadisticas">) {
  const user = await requirePageUser();
  const period = parsePeriodParams(await searchParams);
  const s = await getStatistics(db, user.id, period);
  const fromKey = toDateKey(period.from);
  const toKey = toDateKey(addDays(period.to, -1));
  const empty = s.totals.incomeCount + s.totals.expenseCount === 0;

  return (
    <>
      <PageHeader
        title="Estadísticas"
        description={`${formatDate(period.from)} – ${formatDate(addDays(period.to, -1))}`}
        actions={
          <Suspense>
            <PeriodSelector preset={period.preset} fromKey={fromKey} toKey={toKey} />
          </Suspense>
        }
      />

      {s.excludedCurrencies.length > 0 && (
        <p className="mb-6 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Hay movimientos en {s.excludedCurrencies.join(", ")} sin tasa de cambio; no se incluyen.{" "}
          <Link href="/ajustes" className="underline underline-offset-2">Definir tasa</Link>
        </p>
      )}

      {empty ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No hay ingresos ni gastos en este periodo.</p>
      ) : (
        <div className="flex flex-col gap-12">
          {/* Resumen */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
            <Kpi label="Ingresos"><Money amount={s.totals.income} tone="income" /></Kpi>
            <Kpi label="Gastos"><Money amount={s.totals.expense} /></Kpi>
            <Kpi label="Ahorro" hint={s.totals.income > 0n ? `${s.savingsRate.toLocaleString("es-CO")} % de los ingresos` : undefined}>
              <Money amount={s.totals.savings} tone={s.totals.savings < 0n ? "expense" : "default"} />
            </Kpi>
            <Kpi label="Gasto diario promedio"><Money amount={s.dailyAverage} /></Kpi>
            <Kpi label="Mayor gasto" hint={s.largestExpense ? `${s.largestExpense.description} · ${formatShortDate(s.largestExpense.date)}` : undefined}>
              {s.largestExpense ? <Money amount={s.largestExpense.amount} /> : "—"}
            </Kpi>
            <Kpi label="Categoría con mayor gasto" hint={s.topCategory ? `${s.topCategory.share.toLocaleString("es-CO")} % del gasto` : undefined}>
              {s.topCategory ? (
                <span className="flex items-center gap-2">
                  <CategoryIcon icon={s.topCategory.icon} color={s.topCategory.color} size="sm" />
                  <span className="truncate">{s.topCategory.name}</span>
                </span>
              ) : "—"}
            </Kpi>
            <Kpi label="Posibles gastos hormiga" hint={`${s.ant.count} gastos ≤ umbral`}>
              <Money amount={s.ant.total} />
            </Kpi>
            <Kpi label="Movimientos" hint={`${s.totals.incomeCount} ingresos · ${s.totals.expenseCount} gastos`}>
              <span className="tabular">{s.totals.incomeCount + s.totals.expenseCount}</span>
            </Kpi>
          </dl>

          {/* Evolución */}
          {s.multiMonth ? (
            <div className="grid gap-12 lg:grid-cols-2">
              <section>
                <SectionHeader title="Ingresos vs gastos por mes" />
                <IncomeExpenseChart
                  data={s.monthly.map((m) => ({ label: formatMonthKeyShort(m.month), income: Number(m.income), expense: Number(m.expense) }))}
                />
              </section>
              <section>
                <SectionHeader title="Evolución del ahorro (acumulado)" />
                <div className="mb-3 h-[18px]" aria-hidden />
                <SingleLineChart
                  name="Ahorro acumulado"
                  caption="Ahorro acumulado por mes"
                  data={s.monthly.map((m) => ({ label: formatMonthKeyShort(m.month), value: Number(m.cumulativeNet) }))}
                />
              </section>
            </div>
          ) : (
            <section>
              <SectionHeader title="Gasto por día" />
              {s.daily.length > 0 ? (
                <SingleBarChart
                  name="Gasto"
                  caption="Gasto por día"
                  data={s.daily.map((d) => ({ label: formatShortDate(dateKeyToStartOfDay(d.day)), value: Number(d.expense) }))}
                />
              ) : (
                <p className="text-sm text-muted-foreground">Sin gastos en este periodo.</p>
              )}
            </section>
          )}

          {/* Desglose */}
          <div className="grid gap-12 lg:grid-cols-2">
            <section>
              <SectionHeader title="Gastos por categoría" />
              <CategoryBreakdown items={s.expenseByCategory} tone="expense" emptyText="Sin gastos en este periodo." />
            </section>
            <section>
              <SectionHeader title="Ingresos por fuente" />
              <CategoryBreakdown items={s.incomeByCategory} tone="income" emptyText="Sin ingresos en este periodo." />
            </section>
          </div>

          {/* Gastos hormiga */}
          <section className="rounded-xl bg-muted/50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-medium">Posibles gastos hormiga</h2>
                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                  {s.ant.count > 0 ? (
                    <>
                      {s.ant.count} gastos pequeños suman <Money amount={s.ant.total} className="text-foreground" /> (
                      {s.ant.shareOfExpenses.toLocaleString("es-CO")} % de tus gastos). A este ritmo serían unos{" "}
                      <Money amount={s.ant.yearlyEstimate} className="text-foreground" /> al año.
                    </>
                  ) : (
                    "No se detectaron gastos pequeños en este periodo."
                  )}
                </p>
              </div>
              <Link
                href={`/gastos-hormiga?${new URLSearchParams({ periodo: period.preset, ...(period.preset === "custom" ? { desde: fromKey, hasta: toKey } : {}) })}`}
                className="flex items-center gap-1 text-sm font-medium hover:underline"
              >
                Ver análisis <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Kpi({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold tracking-tight">{children}</dd>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

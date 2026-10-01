import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Info, Repeat } from "lucide-react";
import { PeriodSelector } from "@/components/charts/period-selector";
import { SingleBarChart } from "@/components/charts/simple-charts";
import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { addDays, formatDate, formatMonthKeyShort, formatRelativeDay, toDateKey } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { resolvePeriod } from "@/lib/periods";
import { requirePageUser } from "@/server/auth/guard";
import { db } from "@/server/db";
import { parsePeriodParams } from "@/server/period-params";
import { loadFlows } from "@/server/services/analytics";
import { analyzeAntExpenses } from "@/server/services/ant-expenses";
import { getAntThreshold } from "@/server/services/settings";

export const metadata: Metadata = { title: "Gastos hormiga" };

export default async function AntExpensesPage({ searchParams }: PageProps<"/gastos-hormiga">) {
  const user = await requirePageUser();
  const period = parsePeriodParams(await searchParams);
  const evolutionRange = resolvePeriod("last-6-months");
  const [threshold, periodFlows, evolutionFlows] = await Promise.all([
    getAntThreshold(db, user.id),
    loadFlows(db, user.id, period),
    loadFlows(db, user.id, evolutionRange),
  ]);
  const a = analyzeAntExpenses(periodFlows.flows, threshold, period);
  const evolution = analyzeAntExpenses(evolutionFlows.flows, threshold, evolutionRange).byMonth;

  return (
    <>
      <PageHeader
        title="Gastos hormiga"
        description={`${formatDate(period.from)} – ${formatDate(addDays(period.to, -1))}`}
        actions={
          <Suspense>
            <PeriodSelector preset={period.preset} fromKey={toDateKey(period.from)} toKey={toDateKey(addDays(period.to, -1))} />
          </Suspense>
        }
      />

      <p className="mb-10 flex max-w-prose gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Son gastos de hasta {formatMoney(threshold)} (o registrados en la categoría &ldquo;Gastos hormiga&rdquo;). No todos
          son malos: un café o un pasaje pueden ser necesarios. Aquí solo los ves juntos para decidir si quieres ajustarlos.{" "}
          <Link href="/ajustes" className="underline underline-offset-2">Cambiar umbral</Link>
        </span>
      </p>

      {a.count === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No se detectaron gastos pequeños en este periodo.</p>
      ) : (
        <div className="flex flex-col gap-12">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
            <Kpi label="Gastos pequeños" value={<span className="tabular">{a.count}</span>} hint={`Promedio ${formatMoney(a.average)}`} />
            <Kpi label="Dinero gastado" value={<Money amount={a.total} />} hint={`${a.shareOfExpenses.toLocaleString("es-CO")} % de tus gastos`} />
            <Kpi label="Al mes, a este ritmo" value={<Money amount={a.monthlyEstimate} />} />
            <Kpi label="Al año, a este ritmo" value={<Money amount={a.yearlyEstimate} />} />
          </dl>

          <section>
            <SectionHeader title="Evolución mensual · últimos 6 meses" />
            <SingleBarChart
              name="Gastos hormiga"
              caption="Gastos hormiga por mes"
              data={evolution.map((m) => ({ label: formatMonthKeyShort(m.month), value: Number(m.total) }))}
            />
          </section>

          <div className="grid gap-12 lg:grid-cols-2">
            <section>
              <SectionHeader title="Patrones frecuentes" />
              {a.patterns.length > 0 ? (
                <ul className="divide-y divide-border/60">
                  {a.patterns.slice(0, 8).map((p) => (
                    <li key={`${p.category.id}-${p.label}`} className="flex items-center gap-3 py-3">
                      <span className="flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Repeat className="size-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.count} veces · ~{p.perWeek.toLocaleString("es-CO")} por semana · promedio {formatMoney(p.average)}
                        </p>
                      </div>
                      <Money amount={p.total} className="text-sm font-medium" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Ningún gasto pequeño se repite 3 o más veces con la misma descripción.</p>
              )}
            </section>
            <section>
              <SectionHeader title="Dónde ocurren" />
              <ul className="divide-y divide-border/60">
                {a.byCategory.map((c) => (
                  <li key={c.category.id} className="flex items-center gap-3 py-3">
                    <CategoryIcon icon={c.category.icon} color={c.category.color} size="sm" />
                    <span className="flex-1 text-sm">{c.category.name}</span>
                    <span className="tabular text-xs text-muted-foreground">{c.count} gastos</span>
                    <Money amount={c.total} className="w-24 text-right text-sm font-medium" />
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section>
            <SectionHeader title="Detalle" />
            <ul className="divide-y divide-border/60">
              {a.items.slice(0, 30).map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <CategoryIcon icon={f.category.icon} color={f.category.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{f.description}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeDay(f.date)}</span>
                  <Money amount={f.amount} className="w-20 text-right" />
                </li>
              ))}
            </ul>
            {a.items.length > 30 && (
              <p className="mt-3 text-xs text-muted-foreground">Mostrando 30 de {a.items.length}.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold tracking-tight">{value}</dd>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

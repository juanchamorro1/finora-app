"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, formatMoneyCompact } from "@/lib/money";

export interface IncomeExpensePoint {
  label: string;
  income: number;
  expense: number;
}

/**
 * Barras agrupadas ingreso vs gasto por mes. Pareja de colores validada para
 * daltonismo; el tooltip y la leyenda dan los valores exactos.
 */
export function IncomeExpenseChart({ data, height = 240 }: { data: IncomeExpensePoint[]; height?: number }) {
  return (
    <figure>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground" aria-hidden>
        <LegendDot className="bg-chart-income" label="Ingresos" />
        <LegendDot className="bg-chart-expense" label="Gastos" />
      </div>
      <div style={{ height }} role="img" aria-label="Gráfico de ingresos y gastos por mes">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="28%" margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <YAxis
              width={76}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(v: number) => formatMoneyCompact(BigInt(Math.round(v)))}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as IncomeExpensePoint;
                const net = point.income - point.expense;
                return (
                  <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="mb-1 font-medium capitalize">{label}</p>
                    <TooltipRow className="bg-chart-income" label="Ingresos" value={point.income} />
                    <TooltipRow className="bg-chart-expense" label="Gastos" value={point.expense} />
                    <div className="mt-1 border-t pt-1">
                      <TooltipRow label="Ahorro" value={net} />
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="income" name="Ingresos" fill="var(--chart-income)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="expense" name="Gastos" fill="var(--chart-expense)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Vista de tabla para lectores de pantalla */}
      <table className="sr-only">
        <caption>Ingresos y gastos por mes</caption>
        <thead>
          <tr>
            <th>Mes</th>
            <th>Ingresos</th>
            <th>Gastos</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              <td>{formatMoney(BigInt(d.income))}</td>
              <td>{formatMoney(BigInt(d.expense))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

function TooltipRow({ className, label, value }: { className?: string; label: string; value: number }) {
  return (
    <p className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {className && <span className={`size-2 rounded-sm ${className}`} />}
        {label}
      </span>
      <span className="tabular font-medium text-foreground">{formatMoney(BigInt(Math.round(value)), "COP", { signDisplay: "auto" })}</span>
    </p>
  );
}

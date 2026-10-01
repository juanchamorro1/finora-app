"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatMoneyCompact } from "@/lib/money";

export interface SeriesPoint {
  label: string;
  value: number;
}

const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

function ChartTooltip({ label, value, name }: { label: string; value: number; name: string }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-0.5 text-muted-foreground first-letter:uppercase">{label}</p>
      <p className="flex justify-between gap-6">
        <span className="text-muted-foreground">{name}</span>
        <span className="tabular font-medium">{formatMoney(BigInt(Math.round(value)))}</span>
      </p>
    </div>
  );
}

function SrTable({ caption, data, name }: { caption: string; data: SeriesPoint[]; name: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr><th>Periodo</th><th>{name}</th></tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label}><td>{d.label}</td><td>{formatMoney(BigInt(Math.round(d.value)))}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

/** Barras de una sola serie (ej. gasto por día). */
export function SingleBarChart({
  data,
  name,
  caption,
  height = 220,
  color = "var(--chart-expense)",
}: {
  data: SeriesPoint[];
  name: string;
  caption: string;
  height?: number;
  color?: string;
}) {
  return (
    <figure>
      <div style={{ height }} role="img" aria-label={caption}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} minTickGap={12} />
            <YAxis width={76} tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(v: number) => formatMoneyCompact(BigInt(Math.round(v)))} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? <ChartTooltip label={String(label)} value={Number(payload[0].value)} name={name} /> : null
              }
            />
            <Bar dataKey="value" name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <SrTable caption={caption} data={data} name={name} />
    </figure>
  );
}

/** Línea de una sola serie con referencia en cero (ej. ahorro acumulado). */
export function SingleLineChart({
  data,
  name,
  caption,
  height = 220,
}: {
  data: SeriesPoint[];
  name: string;
  caption: string;
  height?: number;
}) {
  return (
    <figure>
      <div style={{ height }} role="img" aria-label={caption}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.7} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
            <YAxis width={76} tickLine={false} axisLine={false} tick={axisTick} tickFormatter={(v: number) => formatMoneyCompact(BigInt(Math.round(v)))} />
            <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={({ active, payload, label }) =>
                active && payload?.length ? <ChartTooltip label={String(label)} value={Number(payload[0].value)} name={name} /> : null
              }
            />
            <Line
              type="monotone"
              dataKey="value"
              name={name}
              stroke="var(--foreground)"
              strokeWidth={2}
              dot={{ r: 4, fill: "var(--foreground)", stroke: "var(--background)", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SrTable caption={caption} data={data} name={name} />
    </figure>
  );
}

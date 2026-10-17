import { ChevronDown } from "lucide-react";
import { Money } from "@/components/shared/money";
import { currencyInfo } from "@/lib/currency";
import { formatMoney } from "@/lib/money";
import type { CurrencyBreakdown } from "@/server/services/balance-breakdown";

/**
 * Cuadre del mes por moneda: saldo al empezar + ingresos − gastos ± ajustes = saldo.
 * Se abre y se cierra sin JavaScript (<details>).
 */
export function BalanceBreakdown({ items }: { items: CurrencyBreakdown[] }) {
  if (items.length === 0) return null;
  const overspent = items.some((c) => c.expense > c.income);
  const several = items.length > 1;

  return (
    <details className="group mt-6 text-sm">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        {overspent ? "¿Por qué tengo saldo si gasté más de lo que me entró?" : "¿Cómo cuadra tu saldo este mes?"}
        <ChevronDown className="size-3.5 opacity-60 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="mt-3 grid gap-6 sm:grid-cols-2">
        {items.map((c) => (
          <CurrencyBlock key={c.currency} item={c} title={several ? currencyInfo(c.currency).name : undefined} />
        ))}
      </div>
    </details>
  );
}

function CurrencyBlock({ item: c, title }: { item: CurrencyBreakdown; title?: string }) {
  const rows: { label: string; amount: bigint; sign?: "always" }[] = [
    { label: "Saldo al empezar el mes", amount: c.start },
    { label: "Ingresos", amount: c.income, sign: "always" },
    { label: "Gastos", amount: -c.expense, sign: "always" },
  ];
  if (c.adjustments !== 0n) rows.push({ label: "Ajustes de saldo", amount: c.adjustments, sign: "always" });
  if (c.transfers !== 0n) rows.push({ label: "Transferencias con otras monedas", amount: c.transfers, sign: "always" });

  return (
    <div className="max-w-sm">
      {title && <h3 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h3>}
      <dl className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd>
              <Money amount={r.amount} currency={c.currency} signDisplay={r.sign} />
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 border-t border-border/60 pt-1.5 font-medium">
          <dt>Saldo en tus cuentas</dt>
          <dd>
            <Money amount={c.end} currency={c.currency} tone={c.end < 0n ? "expense" : "default"} />
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">{explain(c)}</p>
    </div>
  );
}

function explain(c: CurrencyBreakdown): string {
  const gap = c.expense - c.income;
  if (c.income === 0n && c.expense === 0n) return "Este mes no hay ingresos ni gastos en esta moneda.";
  if (gap <= 0n) {
    return gap === 0n ? "Este mes gastaste lo mismo que te entró." : `Este mes te entró ${formatMoney(-gap, c.currency)} más de lo que gastaste.`;
  }
  const sources: string[] = [];
  if (c.start > 0n) sources.push("lo que ya tenías al empezar el mes");
  if (c.adjustments > 0n) sources.push("los ajustes de saldo");
  if (c.transfers > 0n) sources.push("transferencias desde otras monedas");
  const head = `Gastaste ${formatMoney(gap, c.currency)} más de lo que te entró`;
  if (c.end < 0n || sources.length === 0) return `${head}; por eso el saldo bajó.`;
  return `${head}; la diferencia salió de ${joinEs(sources)}.`;
}

function joinEs(parts: string[]): string {
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`;
}

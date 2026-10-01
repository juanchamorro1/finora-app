import { CategoryIcon } from "@/components/shared/category-icon";
import { Money } from "@/components/shared/money";
import { cn } from "@/lib/utils";

/**
 * Desglose por categoría como lista de barras horizontales: un solo tono por
 * lista (magnitud), la identidad la dan el icono y el nombre, no el color.
 */
export function CategoryBreakdown({
  items,
  tone,
  limit = 8,
  emptyText,
}: {
  items: { categoryId: string; name: string; icon: string; color: string; total: bigint; count: number; share: number }[];
  tone: "income" | "expense";
  limit?: number;
  emptyText: string;
}) {
  if (items.length === 0) return <p className="py-4 text-sm text-muted-foreground">{emptyText}</p>;
  const shown = items.slice(0, limit);
  const rest = items.slice(limit);
  const max = shown[0].total;
  const restTotal = rest.reduce((s, i) => s + i.total, 0n);

  return (
    <ul className="flex flex-col gap-3.5">
      {shown.map((item) => (
        <li key={item.categoryId} className="flex items-center gap-3">
          <CategoryIcon icon={item.icon} color={item.color} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{item.name}</span>
              <span className="flex items-baseline gap-2">
                <span className="tabular text-xs text-muted-foreground">{item.share.toLocaleString("es-CO")} %</span>
                <Money amount={item.total} className="font-medium" />
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", tone === "income" ? "bg-chart-income" : "bg-chart-expense")}
                style={{ width: `${max === 0n ? 0 : Math.max(2, Number((item.total * 1000n) / max) / 10)}%` }}
              />
            </div>
          </div>
        </li>
      ))}
      {rest.length > 0 && (
        <li className="flex items-center justify-between pl-10 text-sm text-muted-foreground">
          <span>Otras {rest.length} categorías</span>
          <Money amount={restTotal} />
        </li>
      )}
    </ul>
  );
}

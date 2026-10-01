import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

type Tone = "default" | "income" | "expense" | "auto" | "muted";

/**
 * Muestra un monto formateado. `tone="auto"` colorea según el signo.
 */
export function Money({
  amount,
  currency = "COP",
  tone = "default",
  signDisplay,
  className,
}: {
  amount: bigint;
  currency?: string;
  tone?: Tone;
  signDisplay?: "auto" | "always";
  className?: string;
}) {
  const resolved = tone === "auto" ? (amount < 0n ? "expense" : amount > 0n ? "income" : "default") : tone;
  return (
    <span
      className={cn(
        "tabular whitespace-nowrap",
        resolved === "income" && "text-income",
        resolved === "expense" && "text-expense",
        resolved === "muted" && "text-muted-foreground",
        className,
      )}
    >
      {formatMoney(amount, currency, { signDisplay })}
    </span>
  );
}

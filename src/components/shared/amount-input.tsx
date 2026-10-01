"use client";

import type { Ref } from "react";
import { currencyInfo } from "@/lib/currency";
import { formatTypingAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Campo de monto con formato colombiano en vivo ("1.250.000").
 * El valor es texto; el servidor lo convierte a BigInt según la moneda.
 */
export function AmountInput({
  value,
  onChange,
  currency,
  size = "default",
  invalid,
  className,
  placeholder,
  ref,
  ...rest
}: {
  ref?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  currency: string;
  size?: "default" | "lg";
  invalid?: boolean;
  id?: string;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  "aria-describedby"?: string;
}) {
  const { symbol, decimals } = currencyInfo(currency);
  return (
    <div
      className={cn(
        "flex items-baseline gap-1 rounded-lg border border-input bg-transparent px-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        size === "lg" ? "h-14" : "h-9",
        invalid && "border-destructive ring-3 ring-destructive/20",
        className,
      )}
    >
      <span className={cn("shrink-0 text-muted-foreground", size === "lg" ? "text-2xl" : "text-sm")}>
        {symbol.trim()}
      </span>
      <input
        ref={ref}
        {...rest}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        placeholder={placeholder ?? "0"}
        value={value}
        onChange={(e) => {
          let next = e.target.value;
          // En monedas con decimales, un "." escrito al final se interpreta como coma decimal.
          if (decimals > 0 && next.endsWith(".") && !next.includes(",") && next.length > value.length) {
            next = next.slice(0, -1) + ",";
          }
          onChange(formatTypingAmount(next, currency));
        }}
        className={cn(
          "tabular h-full w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/60",
          size === "lg" ? "text-3xl font-semibold tracking-tight" : "text-sm",
        )}
      />
    </div>
  );
}

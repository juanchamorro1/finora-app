"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/shared/amount-input";
import { cn } from "@/lib/utils";
import { setAntThresholdAction, setExchangeRateAction } from "@/server/actions/settings";

export function AntThresholdForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await setAntThresholdAction(value);
          if (!result.ok) setError(result.fieldErrors?.amount ?? result.error);
          else {
            setError(undefined);
            toast.success("Umbral actualizado");
          }
        });
      }}
    >
      <div className="flex w-48 flex-col gap-1.5">
        <Label htmlFor="ant-threshold">Gasto pequeño hasta</Label>
        <AmountInput id="ant-threshold" currency="COP" value={value} onChange={setValue} invalid={Boolean(error)} />
      </div>
      <Button type="submit" variant="secondary" disabled={pending || value === initial}>Guardar</Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

export function ExchangeRateForm({ currency, initial, updatedAt }: { currency: string; initial: string; updatedAt: string | null }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await setExchangeRateAction(currency, value);
          if (!result.ok) setError(result.fieldErrors?.amount ?? result.error);
          else {
            setError(undefined);
            toast.success(`Tasa de ${currency} actualizada`);
          }
        });
      }}
    >
      <div className="flex w-48 flex-col gap-1.5">
        <Label htmlFor={`rate-${currency}`}>1 {currency} =</Label>
        <div className="relative">
          <Input
            id={`rate-${currency}`}
            inputMode="decimal"
            className="tabular pr-12"
            placeholder="Ej. 3.950"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={Boolean(error) || undefined}
          />
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">COP</span>
        </div>
      </div>
      <Button type="submit" variant="secondary" disabled={pending || !value || value === initial}>Guardar</Button>
      {updatedAt && <p className="w-full text-xs text-muted-foreground">Actualizada {updatedAt}</p>}
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  // El tema solo se conoce en el cliente: evita desajustes de hidratación.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const options = [
    { value: "system", label: "Sistema", icon: Monitor },
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Oscuro", icon: Moon },
  ];
  return (
    <div className="inline-grid grid-cols-3 gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-label="Tema">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={mounted && theme === o.value}
          onClick={() => setTheme(o.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm text-muted-foreground",
            mounted && theme === o.value && "bg-background text-foreground shadow-sm",
          )}
        >
          <o.icon className="size-3.5" /> {o.label}
        </button>
      ))}
    </div>
  );
}

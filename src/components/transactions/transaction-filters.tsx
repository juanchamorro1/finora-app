"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatTypingAmount } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useTransactionDialog } from "./transaction-dialog-provider";

const TYPE_ITEMS = {
  all: "Todos los tipos",
  EXPENSE: "Gastos",
  INCOME: "Ingresos",
  TRANSFER: "Transferencias",
  OPENING_BALANCE: "Saldos iniciales",
  ADJUSTMENT: "Ajustes",
};

const FILTER_KEYS = ["type", "category", "account", "from", "to", "min", "max"] as const;

/** Buscador + filtros sincronizados con la URL (se pueden compartir y recargar). */
export function TransactionFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { accounts, categories } = useTransactionDialog();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length;
  const [open, setOpen] = useState(activeFilters > 0);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  // Búsqueda con espera corta para no consultar en cada tecla.
  useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update({ q: q.trim() || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const type = params.get("type") ?? "all";
  const categoryItems = {
    all: "Todas las categorías",
    ...Object.fromEntries(
      categories
        .filter((c) => type === "all" || c.kind === type)
        .map((c) => [c.id, `${c.name}${c.kind === "INCOME" ? " (ingreso)" : ""}`]),
    ),
  };
  const accountItems = { all: "Todas las cuentas", ...Object.fromEntries(accounts.map((a) => [a.id, a.name])) };

  return (
    <div className={cn("flex flex-col gap-3", pending && "opacity-80")}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por descripción, nota, categoría o cuenta"
            className="h-9 pl-8"
            aria-label="Buscar movimientos"
          />
        </div>
        <Button
          variant={open || activeFilters ? "secondary" : "outline"}
          className="h-9"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <SlidersHorizontal />
          <span className="hidden sm:inline">Filtros</span>
          {activeFilters > 0 && <span className="tabular text-xs">({activeFilters})</span>}
        </Button>
      </div>

      {open && (
        <div className="grid gap-3 rounded-xl bg-muted/50 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterField label="Tipo">
            <Select items={TYPE_ITEMS} value={type} onValueChange={(v) => update({ type: v === "all" ? null : v, category: null })}>
              <SelectTrigger className="w-full bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_ITEMS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Categoría">
            <Select items={categoryItems} value={params.get("category") ?? "all"} onValueChange={(v) => update({ category: v === "all" ? null : v })}>
              <SelectTrigger className="w-full bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Cuenta">
            <Select items={accountItems} value={params.get("account") ?? "all"} onValueChange={(v) => update({ account: v === "all" ? null : v })}>
              <SelectTrigger className="w-full bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(accountItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <div className="grid grid-cols-2 gap-2">
            <FilterField label="Desde">
              <Input type="date" className="bg-background" value={params.get("from") ?? ""} onChange={(e) => update({ from: e.target.value || null })} />
            </FilterField>
            <FilterField label="Hasta">
              <Input type="date" className="bg-background" value={params.get("to") ?? ""} onChange={(e) => update({ to: e.target.value || null })} />
            </FilterField>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-2">
            <AmountFilter label="Monto mínimo" value={params.get("min") ?? ""} onCommit={(v) => update({ min: v || null })} />
            <AmountFilter label="Monto máximo" value={params.get("max") ?? ""} onCommit={(v) => update({ max: v || null })} />
          </div>
          {activeFilters > 0 && (
            <div className="flex items-end sm:col-span-2 lg:col-span-2 lg:justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}
              >
                <X /> Limpiar filtros
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function AmountFilter({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <FilterField label={label}>
      <Input
        inputMode="numeric"
        className="tabular bg-background"
        placeholder="$0"
        value={text}
        onChange={(e) => setText(formatTypingAmount(e.target.value))}
        onBlur={() => text !== value && onCommit(text)}
        onKeyDown={(e) => e.key === "Enter" && onCommit(text)}
      />
    </FilterField>
  );
}

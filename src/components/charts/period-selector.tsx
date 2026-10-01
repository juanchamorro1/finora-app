"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERIOD_PRESETS, type PeriodPreset } from "@/lib/periods";
import { cn } from "@/lib/utils";

/** Selector de periodo sincronizado con la URL (?periodo=&desde=&hasta=). */
export function PeriodSelector({ preset, fromKey, toKey }: { preset: PeriodPreset; fromKey: string; toKey: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState({ from: fromKey, to: toKey });
  const [showCustom, setShowCustom] = useState(preset === "custom");

  function navigate(next: Record<string, string | null>) {
    const search = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) search.set(k, v);
      else search.delete(k);
    }
    startTransition(() => router.replace(`${pathname}?${search.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-70")}>
      <Select
        items={PERIOD_PRESETS}
        value={showCustom ? "custom" : preset}
        onValueChange={(v) => {
          if (!v) return;
          if (v === "custom") {
            setShowCustom(true);
            return;
          }
          setShowCustom(false);
          navigate({ periodo: v, desde: null, hasta: null });
        }}
      >
        <SelectTrigger className="h-9 min-w-44" aria-label="Periodo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PERIOD_PRESETS).map(([value, label]) => (
            <SelectItem key={value} value={value}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showCustom && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.from && custom.to) navigate({ periodo: "custom", desde: custom.from, hasta: custom.to });
          }}
        >
          <Input type="date" aria-label="Desde" className="h-9 w-auto" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
          <span className="text-sm text-muted-foreground">a</span>
          <Input type="date" aria-label="Hasta" className="h-9 w-auto" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
          <Button type="submit" variant="secondary" className="h-9" disabled={!custom.from || !custom.to}>
            Aplicar
          </Button>
        </form>
      )}
    </div>
  );
}

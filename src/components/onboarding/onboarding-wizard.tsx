"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowLeft, Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AccountFields, type AccountFieldValues } from "@/components/accounts/account-fields";
import { AmountInput } from "@/components/shared/amount-input";
import { CategoryIcon } from "@/components/shared/category-icon";
import type { FieldErrors } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { completeOnboardingAction } from "@/server/actions/onboarding";
import type { DefaultCategory } from "@/server/services/defaults";
import type { AccountType } from "@/generated/prisma/enums";

type Kind = "EXPENSE" | "INCOME";

const ACCOUNT_SUGGESTIONS: { name: string; type: AccountType; currency: string }[] = [
  { name: "Bancolombia", type: "BANK", currency: "COP" },
  { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP" },
  { name: "Efectivo", type: "CASH", currency: "COP" },
  { name: "Binance", type: "CRYPTO", currency: "USDT" },
];

const STEPS = ["Cuenta", "Categorías", "Meta"] as const;

export function OnboardingWizard({
  expenseDefaults,
  incomeDefaults,
}: {
  expenseDefaults: DefaultCategory[];
  incomeDefaults: DefaultCategory[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState<AccountFieldValues>({ name: "", type: "BANK", currency: "COP", openingBalance: "" });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<{ name: string; kind: Kind }[]>([]);
  const [newCategory, setNewCategory] = useState<{ name: string; kind: Kind }>({ name: "", kind: "EXPENSE" });
  const [wantsGoal, setWantsGoal] = useState(false);
  const [goal, setGoal] = useState({ name: "", targetAmount: "", initialSaved: "", targetDate: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  const key = (c: { name: string; kind: string }) => `${c.kind}:${c.name}`;
  const toggleDefault = (c: DefaultCategory) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key(c))) next.delete(key(c));
      else next.add(key(c));
      return next;
    });

  function addCustom() {
    const name = newCategory.name.trim();
    if (!name) return;
    const exists =
      custom.some((c) => c.kind === newCategory.kind && c.name.toLowerCase() === name.toLowerCase()) ||
      [...expenseDefaults, ...incomeDefaults].some((c) => c.kind === newCategory.kind && c.name.toLowerCase() === name.toLowerCase());
    if (exists) {
      toast.error(`Ya existe "${name}"`);
      return;
    }
    setCustom((c) => [...c, { name, kind: newCategory.kind }]);
    setNewCategory((n) => ({ ...n, name: "" }));
  }

  function next() {
    if (step === 0 && !account.name.trim()) {
      setErrors({ "account.name": "Ponle un nombre a tu cuenta" });
      return;
    }
    setErrors({});
    setStep((s) => s + 1);
  }

  function finish() {
    const keep = (list: DefaultCategory[]) =>
      list.filter((c) => !excluded.has(key(c))).map((c) => ({ name: c.name, kind: c.kind }));
    startTransition(async () => {
      const result = await completeOnboardingAction({
        account,
        defaultCategories: [...keep(expenseDefaults), ...keep(incomeDefaults)],
        customCategories: custom,
        goal: wantsGoal ? goal : null,
      });
      if (!result.ok) {
        const fe = result.fieldErrors ?? {};
        setErrors(fe);
        const firstKey = Object.keys(fe)[0] ?? "";
        if (firstKey.startsWith("account")) setStep(0);
        else if (firstKey === "categories") setStep(1);
        toast.error(result.error);
        return;
      }
      toast.success("¡Todo listo! Ya puedes registrar tus movimientos.");
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-10 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">F</span>
        Finora
      </div>

      <ol className="mb-8 flex gap-2" aria-label="Progreso">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1">
            <div className={cn("h-1 rounded-full bg-muted", i <= step && "bg-foreground")} />
            <span className={cn("mt-2 block text-xs text-muted-foreground", i === step && "text-foreground")}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="flex flex-col gap-6">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">Tu primera cuenta</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ¿Dónde tienes tu dinero? Empieza con una; puedes añadir más después.
            </p>
          </header>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_SUGGESTIONS.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => setAccount((a) => ({ ...a, ...s, openingBalance: a.currency === s.currency ? a.openingBalance : "" }))}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm hover:bg-muted",
                  account.name === s.name && "border-foreground bg-foreground text-background hover:bg-foreground",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
          <AccountFields values={account} onChange={setAccount} errors={errors} errorPrefix="account." />
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Desmarca las que no uses y añade las tuyas. Podrás editarlas cuando quieras.
            </p>
          </header>
          {(
            [
              ["Gastos", expenseDefaults, "EXPENSE"],
              ["Ingresos", incomeDefaults, "INCOME"],
            ] as const
          ).map(([title, list, kind]) => (
            <div key={kind}>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h2>
              <div className="flex flex-wrap gap-2">
                {list.map((c) => {
                  const on = !excluded.has(key(c));
                  return (
                    <button
                      key={c.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDefault(c)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm transition-colors",
                        on ? "border-border" : "border-dashed text-muted-foreground line-through opacity-60",
                      )}
                    >
                      <CategoryIcon icon={c.icon} color={c.color} size="sm" className="size-6" />
                      {c.name}
                    </button>
                  );
                })}
                {custom
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <span key={c.name} className="flex items-center gap-1 rounded-full border border-border py-1 pr-1.5 pl-3 text-sm">
                      {c.name}
                      <button
                        type="button"
                        aria-label={`Quitar ${c.name}`}
                        onClick={() => setCustom((list) => list.filter((x) => key(x) !== key(c)))}
                        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ))}
              </div>
            </div>
          ))}
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              addCustom();
            }}
          >
            <Input
              placeholder="Nueva categoría (ej. Mascotas)"
              maxLength={30}
              value={newCategory.name}
              onChange={(e) => setNewCategory((n) => ({ ...n, name: e.target.value }))}
              aria-label="Nombre de la nueva categoría"
            />
            <div className="flex gap-2">
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {(["EXPENSE", "INCOME"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setNewCategory((n) => ({ ...n, kind: k }))}
                    className={cn("rounded-md px-2 text-xs text-muted-foreground", newCategory.kind === k && "bg-background text-foreground shadow-sm")}
                  >
                    {k === "EXPENSE" ? "Gasto" : "Ingreso"}
                  </button>
                ))}
              </div>
              <Button type="submit" variant="outline" disabled={!newCategory.name.trim()}>
                <Plus /> Añadir
              </Button>
            </div>
          </form>
          {errors.categories && <p className="text-sm text-destructive">{errors.categories}</p>}
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-6">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">¿Estás ahorrando para algo?</h1>
            <p className="mt-1 text-sm text-muted-foreground">Opcional. Crear una meta te ayuda a ver tu progreso.</p>
          </header>
          {!wantsGoal ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setWantsGoal(true)}>
                <Plus /> Crear una meta
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="goal-name">Nombre</Label>
                <Input id="goal-name" maxLength={60} placeholder="Ej. PC nueva" value={goal.name} onChange={(e) => setGoal((g) => ({ ...g, name: e.target.value }))} aria-invalid={Boolean(errors["goal.name"]) || undefined} />
                {errors["goal.name"] && <p className="text-sm text-destructive">{errors["goal.name"]}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="goal-target">Objetivo</Label>
                  <AmountInput id="goal-target" currency="COP" value={goal.targetAmount} onChange={(v) => setGoal((g) => ({ ...g, targetAmount: v }))} invalid={Boolean(errors["goal.targetAmount"])} />
                  {errors["goal.targetAmount"] && <p className="text-sm text-destructive">{errors["goal.targetAmount"]}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="goal-saved">Ya ahorrado <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <AmountInput id="goal-saved" currency="COP" value={goal.initialSaved} onChange={(v) => setGoal((g) => ({ ...g, initialSaved: v }))} invalid={Boolean(errors["goal.initialSaved"])} />
                </div>
              </div>
              <div className="flex flex-col gap-1.5 sm:w-1/2">
                <Label htmlFor="goal-date">Fecha objetivo <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Input id="goal-date" type="date" value={goal.targetDate} onChange={(e) => setGoal((g) => ({ ...g, targetDate: e.target.value }))} />
              </div>
              <button type="button" onClick={() => setWantsGoal(false)} className="self-start text-sm text-muted-foreground hover:text-foreground">
                Mejor después
              </button>
            </div>
          )}
        </section>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-12">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={pending}>
            <ArrowLeft /> Atrás
          </Button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>Continuar</Button>
        ) : (
          <Button onClick={finish} disabled={pending}>
            <Check /> {pending ? "Guardando…" : wantsGoal ? "Crear y empezar" : "Empezar"}
          </Button>
        )}
      </div>
    </div>
  );
}

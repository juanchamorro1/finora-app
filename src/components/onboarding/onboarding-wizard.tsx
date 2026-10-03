"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, Banknote, Bitcoin, Building2, Check, Plus, Smartphone, Sparkles, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountFields, type AccountFieldValues } from "@/components/accounts/account-fields";
import { AmountInput } from "@/components/shared/amount-input";
import { CategoryIcon } from "@/components/shared/category-icon";
import type { FieldErrors } from "@/lib/action-result";
import { formatAmountInput, formatMoney, parseMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/server/actions/auth";
import { completeOnboardingAction } from "@/server/actions/onboarding";
import type { DefaultCategory } from "@/server/services/defaults";
import { ACCOUNT_TYPE_LABELS } from "@/types/finance";
import type { AccountType } from "@/generated/prisma/enums";

const ACCOUNT_SUGGESTIONS: { name: string; type: AccountType; currency: string }[] = [
  { name: "Bancolombia", type: "BANK", currency: "COP" },
  { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP" },
  { name: "Daviplata", type: "DIGITAL_WALLET", currency: "COP" },
  { name: "Efectivo", type: "CASH", currency: "COP" },
  { name: "Binance", type: "CRYPTO", currency: "USDT" },
];

const TYPE_ICONS = { BANK: Building2, DIGITAL_WALLET: Smartphone, CASH: Banknote, CRYPTO: Bitcoin, OTHER: Wallet };

type Purpose = "track" | "limit" | "save" | "debt";
const PURPOSES: { id: Purpose; label: string }[] = [
  { id: "track", label: "Saber en qué se me va la plata" },
  { id: "limit", label: "Gastar menos y ponerme límites" },
  { id: "save", label: "Ahorrar para algo" },
  { id: "debt", label: "Salir de deudas" },
];

/** Porcentaje del ingreso sugerido por categoría (aprox. regla 50/30/20). */
const SUGGESTED_SHARE: Record<string, number> = {
  Comida: 25,
  Transporte: 10,
  Entretenimiento: 5,
  Compras: 5,
  Suscripciones: 3,
  Ropa: 3,
  "Gastos hormiga": 2,
};

const ANT_OPTIONS = ["5.000", "10.000", "20.000", "30.000"];

const STEPS = ["Tú", "Cuentas", "Gastos", "Ahorro", "Resumen"] as const;

const emptyAccount = (): AccountFieldValues => ({ name: "", type: "BANK", currency: "COP", openingBalance: "" });

/** Monto escrito → bigint (null si no es válido). */
function tryParse(text: string, currency = "COP"): bigint | null {
  if (!text) return 0n;
  try {
    return parseMoney(text, currency);
  } catch {
    return null;
  }
}

export function OnboardingWizard({
  userName,
  budgetCategories,
  canLogout,
}: {
  userName: string;
  /** Categorías de gasto a las que se les puede poner límite mensual. */
  budgetCategories: DefaultCategory[];
  /** En el primer paso, "Atrás" cierra la sesión y vuelve al inicio de sesión. */
  canLogout: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(userName);
  const [purposes, setPurposes] = useState<Set<Purpose>>(new Set());
  const [income, setIncome] = useState("");
  const [accounts, setAccounts] = useState<AccountFieldValues[]>([]);
  const [draft, setDraft] = useState<AccountFieldValues>(emptyAccount);
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [antThreshold, setAntThreshold] = useState("10.000");
  const [wantsGoal, setWantsGoal] = useState<boolean | null>(null);
  const [goal, setGoal] = useState({ name: "", targetAmount: "", initialSaved: "", targetDate: "", accountIndex: "none" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  // Cada paso empieza arriba (en el celular el botón Continuar queda abajo).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const incomeAmount = tryParse(income) ?? 0n;
  const budgetTotal = Object.values(budgets).reduce((sum, v) => sum + (tryParse(v) ?? 0n), 0n);
  const goalOpen = wantsGoal ?? purposes.has("save");

  function togglePurpose(id: Purpose) {
    setPurposes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Agrega la cuenta en edición a la lista. Devuelve la lista resultante o null si no es válida. */
  function commitDraft(): AccountFieldValues[] | null {
    const trimmed = draft.name.trim();
    if (!trimmed) {
      setErrors({ "draft.name": "Ponle un nombre a la cuenta" });
      return null;
    }
    if (accounts.some((a) => a.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      setErrors({ "draft.name": `Ya agregaste "${trimmed}"` });
      return null;
    }
    if (tryParse(draft.openingBalance, draft.currency) === null) {
      setErrors({ "draft.openingBalance": "Monto inválido" });
      return null;
    }
    const next = [...accounts, { ...draft, name: trimmed }];
    setAccounts(next);
    setDraft(emptyAccount());
    setErrors({});
    // La primera cuenta en COP queda como sugerencia para guardar el ahorro.
    if (goal.accountIndex === "none") {
      const cop = next.findIndex((a) => a.currency === "COP");
      if (cop >= 0) setGoal((g) => ({ ...g, accountIndex: String(cop) }));
    }
    return next;
  }

  function removeAccount(index: number) {
    setAccounts((list) => list.filter((_, i) => i !== index));
    setGoal((g) => {
      const current = g.accountIndex === "none" ? -1 : Number(g.accountIndex);
      if (current === index) return { ...g, accountIndex: "none" };
      return current > index ? { ...g, accountIndex: String(current - 1) } : g;
    });
  }

  function suggestBudgets() {
    const next: Record<string, string> = {};
    for (const c of budgetCategories) {
      const share = SUGGESTED_SHARE[c.name];
      if (!share) continue;
      const amount = ((incomeAmount * BigInt(share)) / 100n / 1000n) * 1000n;
      if (amount > 0n) next[c.name] = formatAmountInput(amount, "COP");
    }
    setBudgets(next);
  }

  function next() {
    if (step === 0 && name.trim().length === 0) {
      setErrors({ name: "Escribe cómo quieres que te llamemos" });
      return;
    }
    if (step === 1) {
      // Si hay una cuenta escrita sin agregar, se agrega al continuar.
      const list = draft.name.trim() ? commitDraft() : accounts;
      if (!list) return;
      if (list.length === 0) {
        setErrors({ "draft.name": "Agrega al menos una cuenta" });
        return;
      }
    }
    if (step === 2) {
      const bad = Object.entries(budgets).find(([, v]) => tryParse(v) === null);
      if (bad) {
        setErrors({ [`budget.${bad[0]}`]: "Monto inválido" });
        return;
      }
    }
    if (step === 3 && goalOpen) {
      const e: FieldErrors = {};
      if (!goal.name.trim()) e["goal.name"] = "Ponle un nombre a la meta";
      if (!tryParse(goal.targetAmount)) e["goal.targetAmount"] = "Ingresa cuánto quieres ahorrar";
      if (Object.keys(e).length) {
        setErrors(e);
        return;
      }
    }
    setErrors({});
    setStep((s) => s + 1);
  }

  function finish() {
    const budgetList = budgetCategories
      .filter((c) => budgets[c.name])
      .map((c) => ({ categoryName: c.name, amount: budgets[c.name] }));
    startTransition(async () => {
      const result = await completeOnboardingAction({
        name,
        accounts,
        budgets: budgetList,
        antThreshold,
        goal: goalOpen
          ? { ...goal, accountIndex: goal.accountIndex === "none" ? null : Number(goal.accountIndex) }
          : null,
      });
      if (!result.ok) {
        const fe = result.fieldErrors ?? {};
        // Los errores de presupuesto llegan por posición en la lista; se pasan al nombre de la categoría.
        const mapped: FieldErrors = {};
        for (const [k, v] of Object.entries(fe)) {
          const m = /^budgets\.(\d+)\./.exec(k);
          mapped[m ? `budget.${budgetList[Number(m[1])]?.categoryName}` : k] = v;
        }
        setErrors(mapped);
        const firstKey = Object.keys(fe)[0] ?? "";
        if (firstKey === "name") setStep(0);
        else if (firstKey.startsWith("accounts")) setStep(1);
        else if (firstKey.startsWith("budgets") || firstKey === "antThreshold") setStep(2);
        else if (firstKey.startsWith("goal")) setStep(3);
        toast.error(result.error);
        return;
      }
      toast.success("¡Todo listo! Ya puedes registrar tus movimientos.");
      router.replace("/");
      router.refresh();
    });
  }

  const firstName = name.trim().split(/\s+/)[0] ?? "";
  const accountErrors = (i: number) =>
    Object.entries(errors)
      .filter(([k]) => k.startsWith(`accounts.${i}.`))
      .map(([, v]) => v);

  // Totales por moneda de lo que el usuario tiene hoy.
  const totals = new Map<string, bigint>();
  for (const a of accounts) totals.set(a.currency, (totals.get(a.currency) ?? 0n) + (tryParse(a.openingBalance, a.currency) ?? 0n));

  const accountItems: Record<string, string> = {
    none: "Ninguna en particular",
    ...Object.fromEntries(accounts.map((a, i) => [String(i), a.name])),
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-10 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">F</span>
        Finora
      </div>

      <ol className="mb-8 flex gap-2" aria-label="Progreso">
        {STEPS.map((label, i) => (
          <li key={label} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <div className={cn("h-1 rounded-full bg-muted", i <= step && "bg-foreground")} />
            <span className={cn("mt-2 hidden text-xs text-muted-foreground sm:block", i === step && "text-foreground")}>
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>
      <p className="-mt-6 mb-6 text-xs text-muted-foreground sm:hidden">
        Paso {step + 1} de {STEPS.length} · {STEPS[step]}
      </p>

      {step === 0 && (
        <section className="flex flex-col gap-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">¡Hola! Cuéntanos un poco de ti</h1>
            <p className="mt-1 text-sm text-muted-foreground">Así dejamos Finora a tu medida. Toma menos de dos minutos.</p>
          </header>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ob-name">¿Cómo quieres que te llamemos?</Label>
            <Input
              id="ob-name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(errors.name) || undefined}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-3 text-sm font-medium">
              ¿Qué quieres lograr? <span className="font-normal text-muted-foreground">(elige las que quieras)</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {PURPOSES.map((p) => {
                const on = purposes.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => togglePurpose(p.id)}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted",
                      on && "border-foreground bg-muted",
                    )}
                  >
                    {p.label}
                    {on && <Check className="size-4 shrink-0" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ob-income">
              ¿Cuánto te entra al mes, más o menos? <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <AmountInput id="ob-income" currency="COP" value={income} onChange={setIncome} />
            <p className="text-xs text-muted-foreground">
              Sueldo, mesada, lo que te den… No se guarda: solo lo usamos para sugerirte límites de gasto.
            </p>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-6">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">¿Dónde tienes tu dinero?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Agrega todas tus cuentas: bancos, billeteras como Nequi, el efectivo… Puedes añadir más después.
            </p>
          </header>

          {accounts.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border">
              {accounts.map((a, i) => {
                const Icon = TYPE_ICONS[a.type];
                const amount = tryParse(a.openingBalance, a.currency) ?? 0n;
                const errs = accountErrors(i);
                return (
                  <li key={a.name} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[a.type]} · {a.currency}
                      </p>
                      {errs.map((e) => (
                        <p key={e} className="text-xs text-destructive">{e}</p>
                      ))}
                    </div>
                    <span className="tabular text-sm font-medium">{formatMoney(amount, a.currency)}</span>
                    <Button variant="ghost" size="icon-sm" aria-label={`Quitar ${a.name}`} onClick={() => removeAccount(i)}>
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-col gap-4 rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">{accounts.length === 0 ? "Tu primera cuenta" : "Agregar otra cuenta"}</p>
            <div className="flex flex-wrap gap-2">
              {ACCOUNT_SUGGESTIONS.filter((s) => !accounts.some((a) => a.name === s.name)).map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onClick={() =>
                    setDraft((d) => ({ ...d, ...s, openingBalance: d.currency === s.currency ? d.openingBalance : "" }))
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm hover:bg-muted",
                    draft.name === s.name && "border-foreground bg-foreground text-background hover:bg-foreground",
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
            <AccountFields
              values={draft}
              onChange={setDraft}
              errors={errors}
              errorPrefix="draft."
              openingBalanceLabel="¿Cuánto tienes hoy en esta cuenta?"
            />
            <Button variant="outline" className="self-start" onClick={() => commitDraft()}>
              <Plus /> Agregar cuenta
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">¿Cuánto quieres gastar al mes?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Opcional. Ponle un tope a las categorías que quieras controlar y Finora te avisará al llegar al 75 %, 90 % y
              100 %. Deja en blanco las demás.
            </p>
          </header>

          {incomeAmount > 0n && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
              <span>
                Asignado <strong className="tabular font-semibold">{formatMoney(budgetTotal)}</strong> de{" "}
                <span className="tabular">{formatMoney(incomeAmount)}</span>
                {budgetTotal > incomeAmount ? (
                  <span className="text-destructive"> · te pasas por {formatMoney(budgetTotal - incomeAmount)}</span>
                ) : (
                  <span className="text-muted-foreground"> · libres {formatMoney(incomeAmount - budgetTotal)}</span>
                )}
              </span>
              <Button variant="outline" size="sm" onClick={suggestBudgets}>
                <Sparkles /> Sugerir según mi ingreso
              </Button>
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {budgetCategories.map((c) => {
              const err = errors[`budget.${c.name}`];
              return (
                <li key={c.name} className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" className="size-8" />
                    <Label htmlFor={`budget-${c.name}`} className="flex-1 font-normal">{c.name}</Label>
                    <AmountInput
                      id={`budget-${c.name}`}
                      currency="COP"
                      placeholder="Sin límite"
                      className="w-40"
                      value={budgets[c.name] ?? ""}
                      onChange={(v) => setBudgets((b) => ({ ...b, [c.name]: v }))}
                      invalid={Boolean(err)}
                    />
                  </div>
                  {err && <p className="text-right text-xs text-destructive">{err}</p>}
                </li>
              );
            })}
          </ul>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">¿Desde qué monto un gasto es “pequeño” para ti?</legend>
            <p className="text-xs text-muted-foreground">
              Finora busca gastos pequeños que se repiten (el café, los snacks, los domicilios) para mostrarte cuánto
              suman al mes: los llamados gastos hormiga.
            </p>
            <div className="flex flex-wrap gap-2">
              {ANT_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={antThreshold === v}
                  onClick={() => setAntThreshold(v)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm hover:bg-muted",
                    antThreshold === v && "border-foreground bg-foreground text-background hover:bg-foreground",
                  )}
                >
                  Hasta ${v}
                </button>
              ))}
            </div>
            {errors.antThreshold && <p className="text-sm text-destructive">{errors.antThreshold}</p>}
          </fieldset>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col gap-6">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">¿Estás ahorrando para algo?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {purposes.has("debt")
                ? "Opcional. También sirve para juntar la plata de una deuda: ponle de nombre “Pagar tarjeta”, por ejemplo."
                : "Opcional. Una meta te muestra cuánto te falta y cuánto ahorrar cada mes."}
            </p>
          </header>
          {!goalOpen ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setWantsGoal(true)}>
                <Plus /> Crear una meta
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="goal-name">¿Para qué es?</Label>
                <Input id="goal-name" maxLength={60} placeholder="Ej. PC nueva, viaje, fondo de emergencia" value={goal.name} onChange={(e) => setGoal((g) => ({ ...g, name: e.target.value }))} aria-invalid={Boolean(errors["goal.name"]) || undefined} />
                {errors["goal.name"] && <p className="text-sm text-destructive">{errors["goal.name"]}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="goal-target">¿Cuánto necesitas?</Label>
                  <AmountInput id="goal-target" currency="COP" value={goal.targetAmount} onChange={(v) => setGoal((g) => ({ ...g, targetAmount: v }))} invalid={Boolean(errors["goal.targetAmount"])} />
                  {errors["goal.targetAmount"] && <p className="text-sm text-destructive">{errors["goal.targetAmount"]}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="goal-saved">¿Cuánto llevas? <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <AmountInput id="goal-saved" currency="COP" value={goal.initialSaved} onChange={(v) => setGoal((g) => ({ ...g, initialSaved: v }))} invalid={Boolean(errors["goal.initialSaved"])} />
                  {errors["goal.initialSaved"] && <p className="text-sm text-destructive">{errors["goal.initialSaved"]}</p>}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="goal-date">¿Para cuándo? <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                  <Input id="goal-date" type="date" value={goal.targetDate} onChange={(e) => setGoal((g) => ({ ...g, targetDate: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>¿En qué cuenta lo guardas?</Label>
                  <Select items={accountItems} value={goal.accountIndex} onValueChange={(v) => v && setGoal((g) => ({ ...g, accountIndex: v }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(accountItems).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                La plata no se mueve: la meta solo aparta una parte de tu dinero para que sepas cuánto llevas.
              </p>
              <button type="button" onClick={() => setWantsGoal(false)} className="self-start text-sm text-muted-foreground hover:text-foreground">
                Mejor después
              </button>
            </div>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="flex flex-col gap-6">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">{firstName ? `Listo, ${firstName}` : "Todo listo"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Revisa que todo esté bien. Puedes cambiar cualquier cosa después.</p>
          </header>
          <dl className="flex flex-col divide-y rounded-lg border text-sm">
            <SummaryRow label="Cuentas" onEdit={() => setStep(1)}>
              <ul className="flex flex-col gap-1">
                {accounts.map((a) => (
                  <li key={a.name} className="flex justify-between gap-4">
                    <span>{a.name}</span>
                    <span className="tabular">{formatMoney(tryParse(a.openingBalance, a.currency) ?? 0n, a.currency)}</span>
                  </li>
                ))}
                {[...totals].map(([currency, total]) => (
                  <li key={currency} className="flex justify-between gap-4 border-t pt-1 font-medium">
                    <span>Total {totals.size > 1 ? currency : ""}</span>
                    <span className="tabular">{formatMoney(total, currency)}</span>
                  </li>
                ))}
              </ul>
            </SummaryRow>
            <SummaryRow label="Límites de gasto" onEdit={() => setStep(2)}>
              {budgetTotal > 0n
                ? `${Object.values(budgets).filter((v) => tryParse(v)).length} categorías · ${formatMoney(budgetTotal)} al mes`
                : "Ninguno por ahora"}
            </SummaryRow>
            <SummaryRow label="Gastos pequeños" onEdit={() => setStep(2)}>
              Hasta ${antThreshold}
            </SummaryRow>
            <SummaryRow label="Meta de ahorro" onEdit={() => setStep(3)}>
              {goalOpen ? `${goal.name.trim()} · ${formatMoney(tryParse(goal.targetAmount) ?? 0n)}` : "Ninguna por ahora"}
            </SummaryRow>
          </dl>
          <p className="text-xs text-muted-foreground">
            Te creamos las categorías más comunes (Comida, Transporte, Trabajo…). Puedes editarlas en Ajustes.
          </p>
        </section>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-12">
        {step > 0 ? (
          <Button
            variant="ghost"
            onClick={() => {
              setErrors({});
              setStep((s) => s - 1);
            }}
            disabled={pending}
          >
            <ArrowLeft /> Atrás
          </Button>
        ) : canLogout ? (
          <form action={logoutAction}>
            <Button type="submit" variant="ghost">
              <ArrowLeft /> Atrás
            </Button>
          </form>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <Button onClick={next}>Continuar</Button>
        ) : (
          <Button onClick={finish} disabled={pending}>
            <Check /> {pending ? "Guardando…" : "Empezar"}
          </Button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center justify-between">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <button type="button" onClick={onEdit} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
          Cambiar
        </button>
      </div>
      <dd>{children}</dd>
    </div>
  );
}

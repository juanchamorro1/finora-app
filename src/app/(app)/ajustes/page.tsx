import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { CategoryManager } from "@/components/settings/category-manager";
import { AntThresholdForm, ExchangeRateForm, ThemeSelector } from "@/components/settings/settings-forms";
import { BASE_CURRENCY } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import { formatAmountInput, formatRate } from "@/lib/money";
import { logoutAction } from "@/server/actions/auth";
import { authMode } from "@/server/auth/session";
import { db } from "@/server/db";
import { listCategoriesWithUsage } from "@/server/services/categories";
import { getAntThreshold } from "@/server/services/settings";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const [categories, threshold, rates, accounts] = await Promise.all([
    listCategoriesWithUsage(db),
    getAntThreshold(db),
    db.exchangeRate.findMany(),
    db.account.findMany({ select: { currency: true } }),
  ]);
  const foreign = [...new Set(accounts.map((a) => a.currency).filter((c) => c !== BASE_CURRENCY))];

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="flex flex-col divide-y divide-border/60">
        <Section title="Categorías" description="Edítalas cuando quieras. Las que tienen movimientos se archivan en lugar de eliminarse, para no perder historial.">
          <CategoryManager
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              kind: c.kind,
              icon: c.icon,
              color: c.color,
              isArchived: c.isArchived,
              transactionCount: c.transactionCount,
              hasBudget: c.hasBudget,
            }))}
          />
        </Section>

        <Section title="Gastos hormiga" description="Los gastos de este monto o menos se analizan como posibles gastos hormiga.">
          <AntThresholdForm initial={formatAmountInput(threshold)} />
        </Section>

        <Section
          title="Tasas de cambio"
          description="Para sumar cuentas en otras monedas al total en pesos. Las defines tú; Finora no consulta servicios externos."
        >
          {foreign.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todas tus cuentas están en COP.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {foreign.map((currency) => {
                const rate = rates.find((r) => r.currency === currency);
                return (
                  <ExchangeRateForm
                    key={currency}
                    currency={currency}
                    initial={rate ? formatRate(rate.rateMicros) : ""}
                    updatedAt={rate ? formatDate(rate.updatedAt) : null}
                  />
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Apariencia">
          <ThemeSelector />
        </Section>

        {authMode() === "enabled" && (
          <Section title="Sesión" description="Tu sesión dura 30 días en cada dispositivo.">
            <form action={logoutAction}>
              <Button type="submit" variant="outline">
                <LogOut /> Cerrar sesión
              </Button>
            </form>
          </Section>
        )}
      </div>
    </>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 py-8 first:pt-0 lg:grid-cols-[16rem_1fr] lg:gap-10">
      <div>
        <h2 className="font-medium">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { CategoryManager } from "@/components/settings/category-manager";
import { PrivacySection } from "@/components/settings/privacy-section";
import { AntThresholdForm, ExchangeRateForm, ThemeSelector } from "@/components/settings/settings-forms";
import { BASE_CURRENCY } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import { formatAmountInput, formatRate } from "@/lib/money";
import { authMode } from "@/server/auth/session";
import { requirePageUser } from "@/server/auth/guard";
import { db } from "@/server/db";
import { listCategoriesWithUsage } from "@/server/services/categories";
import { listExchangeRates } from "@/server/services/exchange-rates";
import { getAntThreshold } from "@/server/services/settings";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const user = await requirePageUser();
  const [categories, threshold, rates, accounts, privacy] = await Promise.all([
    listCategoriesWithUsage(db, user.id),
    getAntThreshold(db, user.id),
    listExchangeRates(db, user.id),
    db.account.findMany({ where: { userId: user.id }, select: { currency: true } }),
    db.user.findUnique({ where: { id: user.id }, select: { privacyAcceptedAt: true } }),
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

        <Section
          title="Privacidad y tus datos"
          description="Tus datos son tuyos: puedes descargarlos o eliminarlos cuando quieras."
        >
          <PrivacySection
            username={user.username}
            acceptedAt={privacy?.privacyAcceptedAt ? formatDate(privacy.privacyAcceptedAt) : null}
            canLogout={authMode() === "enabled"}
          />
        </Section>
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

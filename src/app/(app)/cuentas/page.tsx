import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateAccountDialog } from "@/components/accounts/account-dialogs";
import { AccountRow } from "@/components/accounts/account-row";
import { Money } from "@/components/shared/money";
import { PageHeader, SectionHeader } from "@/components/shared/page-header";
import { requirePageUser } from "@/server/auth/guard";
import { db } from "@/server/db";
import { toAccountOption } from "@/server/mappers";
import { getNetWorth, listAccounts } from "@/server/services/accounts";

export const metadata: Metadata = { title: "Cuentas" };

export default async function AccountsPage() {
  const user = await requirePageUser();
  const [accounts, worth] = await Promise.all([listAccounts(db, user.id, { includeInactive: true }), getNetWorth(db, user.id)]);
  const active = accounts.filter((a) => a.isActive);
  const inactive = accounts.filter((a) => !a.isActive);

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="El saldo de cada cuenta se calcula a partir de sus movimientos."
        actions={<CreateAccountDialog trigger={<Button><Plus /> Nueva cuenta</Button>} />}
      />

      <div className="mb-10">
        <p className="text-sm text-muted-foreground">Total en cuentas activas</p>
        <Money amount={worth.totalBase} className="text-3xl font-semibold tracking-tight" />
        {worth.missingRates.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            No incluye {worth.missingRates.join(", ")}: define su tasa de cambio en Ajustes.
          </p>
        )}
      </div>

      <section>
        <SectionHeader title="Activas" />
        {active.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {active.map((a) => (
              <AccountRow key={a.id} account={toAccountOption(a)} transactionCount={a.transactionCount} balanceBase={a.balanceBase} openingBalance={a.openingBalance} />
            ))}
          </ul>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">No tienes cuentas activas.</p>
        )}
      </section>

      {inactive.length > 0 && (
        <section className="mt-10">
          <SectionHeader title="Inactivas" />
          <ul className="divide-y divide-border/60">
            {inactive.map((a) => (
              <AccountRow key={a.id} account={toAccountOption(a)} transactionCount={a.transactionCount} balanceBase={a.balanceBase} openingBalance={a.openingBalance} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

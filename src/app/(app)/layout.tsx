import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TransactionDialogProvider } from "@/components/transactions/transaction-dialog-provider";
import { requirePageSession } from "@/server/auth/guard";
import { db } from "@/server/db";
import { toAccountOption, toCategoryOption } from "@/server/mappers";
import { listAccounts } from "@/server/services/accounts";
import { listCategories } from "@/server/services/categories";
import { isOnboardingCompleted } from "@/server/services/settings";

// Datos financieros: siempre frescos, nunca prerenderizados.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requirePageSession();
  if (!(await isOnboardingCompleted(db))) redirect("/bienvenida");

  const [accounts, categories] = await Promise.all([
    listAccounts(db, { includeInactive: true }),
    listCategories(db, { includeArchived: true }),
  ]);

  return (
    <TransactionDialogProvider accounts={accounts.map(toAccountOption)} categories={categories.map(toCategoryOption)}>
      <AppShell>{children}</AppShell>
    </TransactionDialogProvider>
  );
}

import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { TransactionDialogProvider } from "@/components/transactions/transaction-dialog-provider";
import { requirePageUser } from "@/server/auth/guard";
import { authMode } from "@/server/auth/session";
import { db } from "@/server/db";
import { toAccountOption, toCategoryOption } from "@/server/mappers";
import { listAccounts } from "@/server/services/accounts";
import { listCategories } from "@/server/services/categories";
import { isOnboardingCompleted } from "@/server/services/settings";

// Datos financieros: siempre frescos, nunca prerenderizados.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requirePageUser();
  if (!(await isOnboardingCompleted(db, user.id))) redirect("/bienvenida");

  const [accounts, categories] = await Promise.all([
    listAccounts(db, user.id, { includeInactive: true }),
    listCategories(db, user.id, { includeArchived: true }),
  ]);

  return (
    <TransactionDialogProvider accounts={accounts.map(toAccountOption)} categories={categories.map(toCategoryOption)}>
      <AppShell userName={user.name} canLogout={authMode() === "enabled"}>
        {children}
      </AppShell>
    </TransactionDialogProvider>
  );
}

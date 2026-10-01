import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { requirePageUser } from "@/server/auth/guard";
import { db } from "@/server/db";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/server/services/defaults";
import { isOnboardingCompleted } from "@/server/services/settings";

export const metadata: Metadata = { title: "Bienvenida" };
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const user = await requirePageUser();
  if (await isOnboardingCompleted(db, user.id)) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-10 sm:py-16">
      <OnboardingWizard expenseDefaults={DEFAULT_EXPENSE_CATEGORIES} incomeDefaults={DEFAULT_INCOME_CATEGORIES} />
    </main>
  );
}

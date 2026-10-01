import type { AccountType, CategoryKind } from "@/generated/prisma/enums";
import { withTx, type Db } from "../db-client";
import { sameName } from "@/lib/text";
import { assertDomain } from "../errors";
import { createAccount } from "./accounts";
import { DEFAULT_CATEGORIES } from "./defaults";
import { createGoal } from "./goals";
import { isOnboardingCompleted, markOnboardingCompleted } from "./settings";

export interface OnboardingInput {
  account: { name: string; type: AccountType; currency: string; openingBalance: bigint };
  /** Nombres de categorías predeterminadas que el usuario quiere conservar, por tipo. */
  defaultCategories: { name: string; kind: CategoryKind }[];
  customCategories: { name: string; kind: CategoryKind }[];
  goal?: { name: string; targetAmount: bigint; targetDate: Date | null; initialSaved: bigint } | null;
}

/**
 * Configuración inicial en una sola transacción: si algo falla no queda nada a medias.
 */
export async function completeOnboarding(db: Db, userId: string, input: OnboardingInput) {
  assertDomain(!(await isOnboardingCompleted(db, userId)), "La configuración inicial ya se completó");
  assertDomain(
    input.defaultCategories.some((c) => c.kind === "EXPENSE") || input.customCategories.some((c) => c.kind === "EXPENSE"),
    "Necesitas al menos una categoría de gasto",
    "categories",
  );
  assertDomain(
    input.defaultCategories.some((c) => c.kind === "INCOME") || input.customCategories.some((c) => c.kind === "INCOME"),
    "Necesitas al menos una categoría de ingreso",
    "categories",
  );

  return withTx(db, async (tx) => {
    const wanted = new Set(input.defaultCategories.map((c) => `${c.kind}:${c.name}`));
    let order = 0;
    for (const cat of DEFAULT_CATEGORIES) {
      if (!wanted.has(`${cat.kind}:${cat.name}`)) continue;
      await tx.category.upsert({
        where: { userId_name_kind: { userId, name: cat.name, kind: cat.kind } },
        create: { ...cat, userId, isDefault: true, sortOrder: order++ },
        update: { isArchived: false },
      });
    }
    const created: { name: string; kind: CategoryKind }[] = DEFAULT_CATEGORIES.filter((c) =>
      wanted.has(`${c.kind}:${c.name}`),
    );
    for (const custom of input.customCategories) {
      const name = custom.name.trim();
      // Ignora vacíos y duplicados (sin distinguir mayúsculas/tildes).
      if (!name || created.some((c) => c.kind === custom.kind && sameName(c.name, name))) continue;
      created.push({ name, kind: custom.kind });
      await tx.category.upsert({
        where: { userId_name_kind: { userId, name, kind: custom.kind } },
        create: { userId, name, kind: custom.kind, sortOrder: order++ },
        update: {},
      });
    }

    const account = await createAccount(tx, userId, input.account);
    if (input.goal) {
      await createGoal(tx, userId, { ...input.goal, accountId: account.id });
    }
    await markOnboardingCompleted(tx, userId);
    return { accountId: account.id };
  });
}

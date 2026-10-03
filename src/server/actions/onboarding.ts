"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AccountType } from "@/generated/prisma/enums";
import { dateKeyToInstant } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { accountFormSchema, dateKey } from "@/lib/validation";
import { db } from "../db";
import { DomainError } from "../errors";
import { MAX_ONBOARDING_ACCOUNTS, completeOnboarding } from "../services/onboarding";
import { runAction } from "./run-action";

const amountText = z.string().trim().max(30).default("");

const onboardingSchema = z.object({
  name: z.string().trim().max(40, "Máximo 40 caracteres").default(""),
  accounts: z
    .array(accountFormSchema.extend({ openingBalance: amountText }))
    .min(1, "Agrega al menos una cuenta")
    .max(MAX_ONBOARDING_ACCOUNTS),
  budgets: z.array(z.object({ categoryName: z.string().trim().min(1).max(30), amount: amountText })).max(30).default([]),
  antThreshold: amountText,
  goal: z
    .object({
      name: z.string().trim().min(1, "El nombre de la meta es obligatorio").max(60),
      targetAmount: z.string().trim().min(1, "Ingresa el objetivo"),
      initialSaved: amountText,
      targetDate: dateKey.optional().or(z.literal("")),
      accountIndex: z.number().int().min(0).nullable().default(null),
    })
    .nullable(),
});

export async function completeOnboardingAction(input: unknown) {
  return runAction(onboardingSchema, input, async (data, userId) => {
    const parse = (text: string, currency: string, field: string) => {
      try {
        return text ? parseMoney(text, currency) : 0n;
      } catch (e) {
        throw new DomainError((e as Error).message, field);
      }
    };
    const result = await completeOnboarding(db, userId, {
      name: data.name,
      accounts: data.accounts.map((a, i) => ({
        name: a.name,
        type: a.type as AccountType,
        currency: a.currency,
        openingBalance: parse(a.openingBalance, a.currency, `accounts.${i}.openingBalance`),
      })),
      budgets: data.budgets.map((b, i) => ({
        categoryName: b.categoryName,
        amount: parse(b.amount, "COP", `budgets.${i}.amount`),
      })),
      antThreshold: data.antThreshold ? parse(data.antThreshold, "COP", "antThreshold") : null,
      goal: data.goal
        ? {
            name: data.goal.name,
            targetAmount: parse(data.goal.targetAmount, "COP", "goal.targetAmount"),
            initialSaved: parse(data.goal.initialSaved, "COP", "goal.initialSaved"),
            targetDate: data.goal.targetDate ? dateKeyToInstant(data.goal.targetDate) : null,
            accountIndex: data.goal.accountIndex,
          }
        : null,
    });
    revalidatePath("/", "layout");
    return result;
  });
}

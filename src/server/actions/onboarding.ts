"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AccountType } from "@/generated/prisma/enums";
import { dateKeyToInstant } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { accountFormSchema, dateKey } from "@/lib/validation";
import { db } from "../db";
import { DomainError } from "../errors";
import { completeOnboarding } from "../services/onboarding";
import { runAction } from "./run-action";

const categoryRef = z.object({ name: z.string().trim().min(1).max(30), kind: z.enum(["INCOME", "EXPENSE"]) });

const onboardingSchema = z.object({
  account: accountFormSchema.extend({ openingBalance: z.string().trim().max(30).default("") }),
  defaultCategories: z.array(categoryRef).max(50),
  customCategories: z.array(categoryRef).max(50),
  goal: z
    .object({
      name: z.string().trim().min(1, "El nombre de la meta es obligatorio").max(60),
      targetAmount: z.string().trim().min(1, "Ingresa el objetivo"),
      initialSaved: z.string().trim().default(""),
      targetDate: dateKey.optional().or(z.literal("")),
    })
    .nullable(),
});

export async function completeOnboardingAction(input: unknown) {
  return runAction(onboardingSchema, input, async (data) => {
    const parse = (text: string, currency: string, field: string) => {
      try {
        return text ? parseMoney(text, currency) : 0n;
      } catch (e) {
        throw new DomainError((e as Error).message, field);
      }
    };
    const result = await completeOnboarding(db, {
      account: {
        name: data.account.name,
        type: data.account.type as AccountType,
        currency: data.account.currency,
        openingBalance: parse(data.account.openingBalance, data.account.currency, "account.openingBalance"),
      },
      defaultCategories: data.defaultCategories,
      customCategories: data.customCategories,
      goal: data.goal
        ? {
            name: data.goal.name,
            targetAmount: parse(data.goal.targetAmount, "COP", "goal.targetAmount"),
            initialSaved: parse(data.goal.initialSaved, "COP", "goal.initialSaved"),
            targetDate: data.goal.targetDate ? dateKeyToInstant(data.goal.targetDate) : null,
          }
        : null,
    });
    revalidatePath("/", "layout");
    return result;
  });
}

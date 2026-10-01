"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMoney } from "@/lib/money";
import { db } from "../db";
import { deleteBudget, setBudget } from "../services/budgets";
import { runAction } from "./run-action";

const budgetSchema = z.object({
  categoryId: z.string().min(1, "Selecciona una categoría"),
  amount: z.string().trim().min(1, "Ingresa un monto"),
});

export async function setBudgetAction(input: unknown) {
  return runAction(budgetSchema, input, async (data, userId) => {
    const budget = await setBudget(db, userId, data.categoryId, parseMoney(data.amount));
    revalidatePath("/", "layout");
    return { id: budget.id };
  });
}

export async function deleteBudgetAction(id: string) {
  return runAction(z.string().min(1), id, async (budgetId, userId) => {
    await deleteBudget(db, userId, budgetId);
    revalidatePath("/", "layout");
    return { id: budgetId };
  });
}

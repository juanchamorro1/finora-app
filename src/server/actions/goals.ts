"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateKeyToInstant } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { dateKey } from "@/lib/validation";
import { db } from "../db";
import { DomainError } from "../errors";
import { addContribution, createGoal, deleteGoal, setGoalArchived, updateGoal } from "../services/goals";
import { runAction } from "./run-action";

const goalSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(60, "Máximo 60 caracteres"),
  targetAmount: z.string().trim().min(1, "Ingresa el objetivo"),
  initialSaved: z.string().trim().optional().default(""),
  targetDate: dateKey.optional().or(z.literal("")),
  accountId: z.string().optional().nullable(),
});

function money(text: string, field: string): bigint {
  try {
    return text ? parseMoney(text) : 0n;
  } catch (e) {
    throw new DomainError((e as Error).message, field);
  }
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function createGoalAction(input: unknown) {
  return runAction(goalSchema, input, async (data, userId) => {
    const goal = await createGoal(db, userId, {
      name: data.name,
      targetAmount: money(data.targetAmount, "targetAmount"),
      initialSaved: money(data.initialSaved, "initialSaved"),
      targetDate: data.targetDate ? dateKeyToInstant(data.targetDate) : null,
      accountId: data.accountId || null,
    });
    revalidateAll();
    return { id: goal.id };
  });
}

export async function updateGoalAction(id: string, input: unknown) {
  return runAction(goalSchema.omit({ initialSaved: true }), input, async (data, userId) => {
    await updateGoal(db, userId, id, {
      name: data.name,
      targetAmount: money(data.targetAmount, "targetAmount"),
      targetDate: data.targetDate ? dateKeyToInstant(data.targetDate) : null,
      accountId: data.accountId || null,
    });
    revalidateAll();
    return { id };
  });
}

const contributionSchema = z.object({
  goalId: z.string().min(1),
  amount: z.string().trim().min(1, "Ingresa un monto"),
  direction: z.enum(["add", "withdraw"]),
  note: z.string().trim().max(200).optional(),
});

export async function addContributionAction(input: unknown) {
  return runAction(contributionSchema, input, async (data, userId) => {
    const value = money(data.amount, "amount");
    if (value <= 0n) throw new DomainError("El monto debe ser mayor a 0", "amount");
    const result = await addContribution(db, userId, data.goalId, data.direction === "add" ? value : -value, { note: data.note });
    revalidateAll();
    return { completed: result.completed };
  });
}

export async function setGoalArchivedAction(id: string, archived: boolean) {
  return runAction(z.object({ id: z.string().min(1), archived: z.boolean() }), { id, archived }, async (d, userId) => {
    await setGoalArchived(db, userId, d.id, d.archived);
    revalidateAll();
    return { id: d.id };
  });
}

export async function deleteGoalAction(id: string) {
  return runAction(z.string().min(1), id, async (goalId, userId) => {
    await deleteGoal(db, userId, goalId);
    revalidateAll();
    return { id: goalId };
  });
}

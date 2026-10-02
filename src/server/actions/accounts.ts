"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMoney } from "@/lib/money";
import { createAccountSchema, updateAccountSchema } from "@/lib/validation";
import type { AccountType } from "@/generated/prisma/enums";
import { db } from "../db";
import { DomainError } from "../errors";
import {
  createAccount,
  deleteAccount,
  getOwnAccount,
  reconcileBalance,
  setAccountActive,
  updateAccount,
} from "../services/accounts";
import { runAction } from "./run-action";

/** Saldo inicial escrito por el usuario ("" = 0); el error queda en el campo. */
function parseOpeningBalance(text: string, currency: string): bigint {
  try {
    return text ? parseMoney(text, currency) : 0n;
  } catch (e) {
    throw new DomainError((e as Error).message, "openingBalance");
  }
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function createAccountAction(input: unknown) {
  return runAction(createAccountSchema, input, async (data, userId) => {
    const openingBalance = parseOpeningBalance(data.openingBalance, data.currency);
    const account = await createAccount(db, userId, {
      name: data.name,
      type: data.type as AccountType,
      currency: data.currency,
      openingBalance,
    });
    revalidateAll();
    return { id: account.id };
  });
}

export async function updateAccountAction(id: string, input: unknown) {
  return runAction(updateAccountSchema, input, async (data, userId) => {
    const openingBalance =
      data.openingBalance === undefined ? undefined : parseOpeningBalance(data.openingBalance, data.currency);
    await updateAccount(db, userId, id, {
      name: data.name,
      type: data.type as AccountType,
      currency: data.currency,
      openingBalance,
    });
    revalidateAll();
    return { id };
  });
}

export async function setAccountActiveAction(id: string, isActive: boolean) {
  return runAction(z.object({ id: z.string().min(1), isActive: z.boolean() }), { id, isActive }, async (d, userId) => {
    await setAccountActive(db, userId, d.id, d.isActive);
    revalidateAll();
    return { id: d.id };
  });
}

export async function reconcileAccountAction(id: string, actualBalance: string) {
  const schema = z.object({ id: z.string().min(1), actualBalance: z.string().trim().min(1, "Ingresa el saldo real") });
  return runAction(schema, { id, actualBalance }, async (d, userId) => {
    const account = await getOwnAccount(db, userId, d.id);
    const adjustment = await reconcileBalance(db, userId, d.id, parseMoney(d.actualBalance, account.currency));
    revalidateAll();
    return { adjusted: adjustment !== null };
  });
}

export async function deleteAccountAction(id: string) {
  return runAction(z.string().min(1), id, async (accountId, userId) => {
    await deleteAccount(db, userId, accountId);
    revalidateAll();
    return { id: accountId };
  });
}

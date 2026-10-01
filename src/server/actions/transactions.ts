"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { dateKeyToInstant } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { transactionFormSchema } from "@/lib/validation";
import { db } from "../db";
import { DomainError } from "../errors";
import {
  createTransaction,
  purgeTransaction,
  restoreTransaction,
  trashTransaction,
  updateTransaction,
  type TransactionInput,
} from "../services/transactions";
import { runAction } from "./run-action";

type FormData = z.output<typeof transactionFormSchema>;

/** Convierte los textos del formulario a montos según la moneda de cada cuenta. */
async function toInput(data: FormData): Promise<TransactionInput> {
  const account = await db.account.findUnique({ where: { id: data.accountId } });
  if (!account) throw new DomainError("La cuenta no existe", "accountId");
  let toAmount: bigint | null = null;
  if (data.type === "TRANSFER" && data.toAccountId && data.toAmount) {
    const toAccount = await db.account.findUnique({ where: { id: data.toAccountId } });
    if (toAccount && toAccount.currency !== account.currency) {
      try {
        toAmount = parseMoney(data.toAmount, toAccount.currency);
      } catch (e) {
        throw new DomainError((e as Error).message, "toAmount");
      }
    }
  }
  return {
    type: data.type,
    amount: parseMoney(data.amount, account.currency),
    accountId: data.accountId,
    toAccountId: data.type === "TRANSFER" ? data.toAccountId : null,
    toAmount,
    categoryId: data.type === "TRANSFER" ? null : data.categoryId,
    date: dateKeyToInstant(data.date),
    description: data.description,
    note: data.note,
  };
}

function revalidateAll() {
  revalidatePath("/", "layout");
}

export async function createTransactionAction(input: unknown) {
  return runAction(transactionFormSchema, input, async (data) => {
    const tx = await createTransaction(db, await toInput(data));
    revalidateAll();
    return { id: tx.id };
  });
}

export async function updateTransactionAction(id: string, input: unknown) {
  return runAction(transactionFormSchema, input, async (data) => {
    const tx = await updateTransaction(db, id, await toInput(data));
    revalidateAll();
    return { id: tx.id };
  });
}

const idSchema = z.string().min(1);

export async function trashTransactionAction(id: string) {
  return runAction(idSchema, id, async (txId) => {
    await trashTransaction(db, txId);
    revalidateAll();
    return { id: txId };
  });
}

export async function restoreTransactionAction(id: string) {
  return runAction(idSchema, id, async (txId) => {
    await restoreTransaction(db, txId);
    revalidateAll();
    return { id: txId };
  });
}

export async function purgeTransactionAction(id: string) {
  return runAction(idSchema, id, async (txId) => {
    await purgeTransaction(db, txId);
    revalidateAll();
    return { id: txId };
  });
}

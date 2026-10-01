"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMoney, parseRate } from "@/lib/money";
import { currencySchema } from "@/lib/validation";
import { db } from "../db";
import { DomainError } from "../errors";
import { setExchangeRate } from "../services/exchange-rates";
import { setAntThreshold } from "../services/settings";
import { runAction } from "./run-action";

export async function setExchangeRateAction(currency: string, rate: string) {
  const schema = z.object({ currency: currencySchema, rate: z.string().trim().min(1, "Ingresa la tasa") });
  return runAction(schema, { currency, rate }, async (d) => {
    await setExchangeRate(db, d.currency, parseRate(d.rate));
    revalidatePath("/", "layout");
    return { currency: d.currency };
  });
}

export async function setAntThresholdAction(amount: string) {
  return runAction(z.string().trim().min(1, "Ingresa un monto"), amount, async (text) => {
    const value = parseMoney(text);
    if (value <= 0n) throw new DomainError("El umbral debe ser mayor a 0", "amount");
    await setAntThreshold(db, value);
    revalidatePath("/", "layout");
    return { amount: value.toString() };
  });
}

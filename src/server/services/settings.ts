import type { Db, DbTx } from "../db-client";
import { DEFAULT_ANT_THRESHOLD } from "./defaults";

export const SETTING_KEYS = {
  onboardingCompleted: "onboarding.completed",
  antThreshold: "ant.threshold",
} as const;

async function getSetting(db: Db | DbTx, userId: string, key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { userId_key: { userId, key } } });
  return row?.value ?? null;
}

async function setSetting(db: Db | DbTx, userId: string, key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value },
    update: { value },
  });
}

export async function isOnboardingCompleted(db: Db | DbTx, userId: string): Promise<boolean> {
  return (await getSetting(db, userId, SETTING_KEYS.onboardingCompleted)) === "true";
}

export async function markOnboardingCompleted(db: Db | DbTx, userId: string): Promise<void> {
  await setSetting(db, userId, SETTING_KEYS.onboardingCompleted, "true");
}

/** Monto máximo (COP) para considerar un gasto como posible gasto hormiga. */
export async function getAntThreshold(db: Db | DbTx, userId: string): Promise<bigint> {
  const value = await getSetting(db, userId, SETTING_KEYS.antThreshold);
  return value && /^\d+$/.test(value) ? BigInt(value) : DEFAULT_ANT_THRESHOLD;
}

export async function setAntThreshold(db: Db | DbTx, userId: string, amount: bigint): Promise<void> {
  await setSetting(db, userId, SETTING_KEYS.antThreshold, amount.toString());
}

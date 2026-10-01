import type { Db, DbTx } from "../db-client";
import { DEFAULT_ANT_THRESHOLD } from "./defaults";

export const SETTING_KEYS = {
  onboardingCompleted: "onboarding.completed",
  antThreshold: "ant.threshold",
} as const;

async function getSetting(db: Db | DbTx, key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setSetting(db: Db | DbTx, key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

export async function isOnboardingCompleted(db: Db | DbTx): Promise<boolean> {
  return (await getSetting(db, SETTING_KEYS.onboardingCompleted)) === "true";
}

export async function markOnboardingCompleted(db: Db | DbTx): Promise<void> {
  await setSetting(db, SETTING_KEYS.onboardingCompleted, "true");
}

/** Monto máximo (COP) para considerar un gasto como posible gasto hormiga. */
export async function getAntThreshold(db: Db | DbTx): Promise<bigint> {
  const value = await getSetting(db, SETTING_KEYS.antThreshold);
  return value && /^\d+$/.test(value) ? BigInt(value) : DEFAULT_ANT_THRESHOLD;
}

export async function setAntThreshold(db: Db | DbTx, amount: bigint): Promise<void> {
  await setSetting(db, SETTING_KEYS.antThreshold, amount.toString());
}

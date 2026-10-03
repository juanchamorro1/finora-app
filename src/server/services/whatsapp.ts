import { randomInt } from "node:crypto";
import type { Db, DbTx } from "../db-client";
import { clearLoginFailures, isLoginLocked, registerLoginFailure } from "./users";

/**
 * Vinculación de un número de WhatsApp con un usuario.
 *
 * Desde Ajustes el usuario genera un código de 6 dígitos (vale 10 minutos) y lo
 * envía al número de Finora ("vincular 123456"). Así nadie puede escribir en una
 * cuenta ajena desde otro número. Los intentos fallidos por número se frenan con
 * la misma tabla de intentos del inicio de sesión.
 */

const LINK_KEY = "whatsapp.link";
export const LINK_CODE_MINUTES = 10;
/** Días que se guarda el historial de mensajes. */
export const WHATSAPP_RETENTION_DAYS = 30;

/** Solo dígitos, con indicativo de país (como lo envía WhatsApp: "573001234567"). */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Genera (o reemplaza) el código de vinculación del usuario. */
export async function createLinkCode(db: Db | DbTx, userId: string, now: Date = new Date()): Promise<string> {
  let code: string;
  // Evita repetir un código vigente de otro usuario (improbable con 6 dígitos).
  do {
    code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  } while (await db.setting.findFirst({ where: { key: LINK_KEY, value: { startsWith: `${code}:` } } }));
  const value = `${code}:${now.getTime() + LINK_CODE_MINUTES * 60_000}`;
  await db.setting.upsert({
    where: { userId_key: { userId, key: LINK_KEY } },
    create: { userId, key: LINK_KEY, value },
    update: { value },
  });
  return code;
}

export type LinkResult = { ok: true; userName: string } | { ok: false; reason: "invalid" | "locked" };

/** Vincula `phone` con el dueño del código, si es válido y no venció. */
export async function linkPhone(db: Db, phone: string, code: string, now: Date = new Date()): Promise<LinkResult> {
  const digits = normalizePhone(phone);
  const brakeKey = `whatsapp:${digits}`;
  if (await isLoginLocked(db, brakeKey, now)) return { ok: false, reason: "locked" };
  const row = /^\d{6}$/.test(code)
    ? await db.setting.findFirst({ where: { key: LINK_KEY, value: { startsWith: `${code}:` } } })
    : null;
  const expires = Number(row?.value.split(":")[1]);
  if (!row || !(expires > now.getTime())) {
    await registerLoginFailure(db, brakeKey, now);
    return { ok: false, reason: "invalid" };
  }
  const user = await db.$transaction(async (tx) => {
    // Un número solo puede estar en una cuenta: se suelta de la anterior.
    await tx.user.updateMany({ where: { whatsappPhone: digits, id: { not: row.userId } }, data: { whatsappPhone: null } });
    await tx.whatsAppMessage.deleteMany({ where: { phone: digits, userId: { not: row.userId } } });
    await tx.setting.delete({ where: { userId_key: { userId: row.userId, key: LINK_KEY } } });
    return tx.user.update({ where: { id: row.userId }, data: { whatsappPhone: digits }, select: { name: true } });
  });
  await clearLoginFailures(db, brakeKey);
  return { ok: true, userName: user.name };
}

/** Desvincula el número y borra el historial de mensajes. */
export async function unlinkWhatsApp(db: Db, userId: string) {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { whatsappPhone: null } }),
    db.whatsAppMessage.deleteMany({ where: { userId } }),
    db.setting.deleteMany({ where: { userId, key: LINK_KEY } }),
  ]);
}

export interface WhatsAppStatus {
  phone: string | null;
  /** Código pendiente aún vigente (para mostrarlo de nuevo si recarga la página). */
  pendingCode: { code: string; expiresAt: Date } | null;
}

export async function getWhatsAppStatus(db: Db | DbTx, userId: string, now: Date = new Date()): Promise<WhatsAppStatus> {
  const [user, pending] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { whatsappPhone: true } }),
    db.setting.findUnique({ where: { userId_key: { userId, key: LINK_KEY } } }),
  ]);
  const [code, expiresMs] = pending?.value.split(":") ?? [];
  const expiresAt = new Date(Number(expiresMs));
  return {
    phone: user.whatsappPhone,
    pendingCode: code && expiresAt > now ? { code, expiresAt } : null,
  };
}

/** Usuario dueño de un número vinculado (o null). */
export async function findUserByPhone(db: Db | DbTx, phone: string) {
  return db.user.findUnique({
    where: { whatsappPhone: normalizePhone(phone) },
    select: { id: true, name: true, privacyVersion: true },
  });
}

/** Últimos mensajes de la conversación (más antiguo primero), para dar contexto al asistente. */
export async function recentConversation(db: Db | DbTx, userId: string, now: Date = new Date(), opts = { hours: 6, limit: 12 }) {
  const rows = await db.whatsAppMessage.findMany({
    where: { userId, createdAt: { gte: new Date(now.getTime() - opts.hours * 3_600_000) } },
    orderBy: { createdAt: "desc" },
    take: opts.limit,
    select: { role: true, text: true },
  });
  return rows.reverse().map((r) => ({ role: r.role === "assistant" ? ("assistant" as const) : ("user" as const), text: r.text }));
}

/**
 * Guarda un mensaje. Devuelve false si ese id ya existía: Meta reintentó el
 * webhook y el mensaje ya se procesó.
 */
export async function saveMessage(
  db: Db | DbTx,
  msg: { id: string; userId: string | null; phone: string; role: "user" | "assistant"; text: string; createdAt?: Date },
): Promise<boolean> {
  try {
    await db.whatsAppMessage.create({ data: { ...msg, phone: normalizePhone(msg.phone), text: msg.text.slice(0, 4096) } });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return false;
    throw error;
  }
}

/** Retención: borra los mensajes con más de 30 días. */
export async function purgeOldMessages(db: Db | DbTx, now: Date = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - WHATSAPP_RETENTION_DAYS * 86_400_000);
  const { count } = await db.whatsAppMessage.deleteMany({ where: { createdAt: { lt: limit } } });
  return count;
}

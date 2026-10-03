/**
 * Sesiones firmadas con HMAC-SHA256 (cookie "<userId>.<expira-ms>.<firma>").
 * Usa Web Crypto para funcionar igual en el proxy y en el servidor.
 *
 * Variable de entorno:
 *   FINORA_SESSION_SECRET  secreto aleatorio (≥ 32 caracteres) para firmar la cookie.
 *
 * Sin secreto, en desarrollo la app no pide contraseña (usa el primer usuario).
 * En producción el secreto es obligatorio: sin él la app se niega a abrir.
 */

import { readEnv } from "../env";

export const SESSION_COOKIE = "finora_session";
/** La sesión dura 6 meses y se renueva sola mientras se use la app. */
export const SESSION_DAYS = 180;
/** Se renueva la cookie como máximo una vez al día. */
const RENEW_AFTER_MS = 86_400_000;

export type AuthMode = "disabled" | "enabled" | "misconfigured";

export function authMode(): AuthMode {
  const secret = readEnv("FINORA_SESSION_SECRET");
  if (!secret) return process.env.NODE_ENV === "production" ? "misconfigured" : "disabled";
  return secret.length >= 32 ? "enabled" : "misconfigured";
}

const encoder = new TextEncoder();

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(readEnv("FINORA_SESSION_SECRET") ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`finora:${value}`));
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const USER_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export interface SessionClaims {
  userId: string;
  /** Debe coincidir con User.sessionVersion; si no, la sesión fue revocada. */
  version: number;
}

/** Crea el valor de la cookie: "<userId>.<versión>.<expira-ms>.<firma>". */
export async function createSessionToken(
  userId: string,
  version: number,
  now: number = Date.now(),
): Promise<{ value: string; expires: Date }> {
  if (!USER_ID.test(userId)) throw new Error("userId inválido");
  if (!Number.isInteger(version) || version < 0) throw new Error("versión inválida");
  const expires = now + SESSION_DAYS * 86_400_000;
  const payload = `${userId}:${version}:${expires}`;
  return { value: `${userId}.${version}.${expires}.${await hmac(payload)}`, expires: new Date(expires) };
}

/**
 * Devuelve los datos de la cookie si es auténtica y no expiró; si no, null.
 * (La versión se compara con la base de datos en `getCurrentUser`.)
 */
export async function verifySessionToken(token: string | undefined, now: number = Date.now()): Promise<SessionClaims | null> {
  if (!token) return null;
  const [userId, version, expires, signature, extra] = token.split(".");
  if (extra !== undefined || !userId || !USER_ID.test(userId) || !version || !expires || !signature) return null;
  if (!/^\d+$/.test(version) || !/^\d+$/.test(expires) || Number(expires) < now) return null;
  const valid = safeEqual(signature, await hmac(`${userId}:${version}:${expires}`));
  return valid ? { userId, version: Number(version) } : null;
}

/** ¿Conviene renovar esta cookie válida? (si se emitió hace más de un día). */
export function shouldRenewSession(token: string, now: number = Date.now()): boolean {
  const expires = Number(token.split(".")[2]);
  return Number.isFinite(expires) && expires - now < SESSION_DAYS * 86_400_000 - RENEW_AFTER_MS;
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

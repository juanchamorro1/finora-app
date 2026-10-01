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

export const SESSION_COOKIE = "finora_session";
export const SESSION_DAYS = 30;

export type AuthMode = "disabled" | "enabled" | "misconfigured";

export function authMode(): AuthMode {
  const secret = process.env.FINORA_SESSION_SECRET;
  if (!secret) return process.env.NODE_ENV === "production" ? "misconfigured" : "disabled";
  return secret.length >= 32 ? "enabled" : "misconfigured";
}

const encoder = new TextEncoder();

async function hmac(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(process.env.FINORA_SESSION_SECRET ?? ""),
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

/** Crea el valor de la cookie para un usuario. */
export async function createSessionToken(userId: string, now: number = Date.now()): Promise<{ value: string; expires: Date }> {
  if (!USER_ID.test(userId)) throw new Error("userId inválido");
  const expires = now + SESSION_DAYS * 86_400_000;
  return { value: `${userId}.${expires}.${await hmac(`${userId}:${expires}`)}`, expires: new Date(expires) };
}

/** Devuelve el userId si la cookie es auténtica y no expiró; si no, null. */
export async function verifySessionToken(token: string | undefined, now: number = Date.now()): Promise<string | null> {
  if (!token) return null;
  const [userId, expires, signature, extra] = token.split(".");
  if (extra !== undefined || !userId || !USER_ID.test(userId) || !expires || !signature) return null;
  if (!/^\d+$/.test(expires) || Number(expires) < now) return null;
  return safeEqual(signature, await hmac(`${userId}:${expires}`)) ? userId : null;
}

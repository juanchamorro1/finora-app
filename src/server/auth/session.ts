/**
 * Sesión de un solo usuario: cookie firmada con HMAC-SHA256.
 * Usa Web Crypto para funcionar igual en el proxy y en el servidor.
 *
 * Variables de entorno:
 *   FINORA_PASSWORD_HASH   hash scrypt de la contraseña (npm run auth:hash)
 *   FINORA_SESSION_SECRET  secreto aleatorio para firmar la cookie (≥ 32 caracteres)
 *
 * Sin FINORA_PASSWORD_HASH la app no pide contraseña (uso local). En producción
 * la contraseña es obligatoria: sin ella la app se niega a abrir.
 */

export const SESSION_COOKIE = "finora_session";
export const SESSION_DAYS = 30;

export type AuthMode = "disabled" | "enabled" | "misconfigured";

export function authMode(): AuthMode {
  const hash = process.env.FINORA_PASSWORD_HASH;
  const secret = process.env.FINORA_SESSION_SECRET;
  if (!hash) return process.env.NODE_ENV === "production" ? "misconfigured" : "disabled";
  if (!secret || secret.length < 32) return "misconfigured";
  return "enabled";
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

/** Crea el valor de la cookie: "<expira-ms>.<firma>". */
export async function createSessionToken(now: number = Date.now()): Promise<{ value: string; expires: Date }> {
  const expires = now + SESSION_DAYS * 86_400_000;
  return { value: `${expires}.${await hmac(String(expires))}`, expires: new Date(expires) };
}

export async function verifySessionToken(token: string | undefined, now: number = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || !/^\d+$/.test(expires) || Number(expires) < now) return false;
  return safeEqual(signature, await hmac(expires));
}

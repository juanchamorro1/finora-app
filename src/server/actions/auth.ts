"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPassword } from "../auth/password";
import { SESSION_COOKIE, authMode, createSessionToken } from "../auth/session";
import { db } from "../db";

// Freno simple contra intentos repetidos, por usuario (por instancia del servidor).
const attempts = new Map<string, { failures: number; lockedUntil: number }>();
const MAX_FAILURES = 5;
const LOCK_MS = 60_000;

export type LoginState = { error?: string; username?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const mode = authMode();
  if (mode === "disabled") redirect("/");
  if (mode === "misconfigured") return { error: "La app no está configurada (falta FINORA_SESSION_SECRET)." };

  const username = String(formData.get("username") ?? "").trim().toLowerCase().slice(0, 30);
  const password = String(formData.get("password") ?? "");
  const state = attempts.get(username) ?? { failures: 0, lockedUntil: 0 };
  if (Date.now() < state.lockedUntil) {
    return { username, error: "Demasiados intentos. Espera un minuto e inténtalo de nuevo." };
  }

  const user = username ? await db.user.findUnique({ where: { username } }) : null;
  // Se verifica aunque el usuario no exista para no revelar qué usuarios existen.
  const valid =
    password.length > 0 &&
    password.length <= 200 &&
    (await verifyPassword(password, user?.passwordHash ?? "scrypt:00:00")) &&
    user !== null;

  if (!valid || !user) {
    state.failures++;
    if (state.failures >= MAX_FAILURES) {
      state.failures = 0;
      state.lockedUntil = Date.now() + LOCK_MS;
    }
    attempts.set(username, state);
    await new Promise((r) => setTimeout(r, 700));
    return { username, error: "Usuario o contraseña incorrectos." };
  }

  attempts.delete(username);
  const { value, expires } = await createSessionToken(user.id);
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
  redirect("/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

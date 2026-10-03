"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionUser } from "../auth/guard";
import { verifyPassword } from "../auth/password";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, authMode, createSessionToken, registrationOpen } from "../auth/session";
import { db } from "../db";
import { DomainError } from "../errors";
import {
  acceptPrivacyPolicy,
  clearLoginFailures,
  createUser,
  deleteUserAccount,
  isLoginLocked,
  isRegistrationLimited,
  recordRegistration,
  registerLoginFailure,
  revokeAllSessions,
} from "../services/users";
import { runAction, toFailure } from "./run-action";

export type LoginState = { error?: string; username?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const mode = authMode();
  if (mode === "disabled") redirect("/");
  if (mode === "misconfigured") return { error: "La app no está configurada (falta FINORA_SESSION_SECRET)." };

  const username = String(formData.get("username") ?? "").trim().toLowerCase().slice(0, 30);
  const password = String(formData.get("password") ?? "");
  if (username && (await isLoginLocked(db, username))) {
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
    if (username) await registerLoginFailure(db, username);
    await new Promise((r) => setTimeout(r, 700));
    return { username, error: "Usuario o contraseña incorrectos." };
  }

  await clearLoginFailures(db, username);
  const { value, expires } = await createSessionToken(user.id, user.sessionVersion);
  (await cookies()).set(SESSION_COOKIE, value, { ...SESSION_COOKIE_OPTIONS, expires });
  redirect("/");
}

export type RegisterState =
  | { error?: string; fieldErrors?: Record<string, string>; values?: { name: string; username: string } }
  | undefined;

/** IP del visitante (Vercel la pone en x-forwarded-for). */
async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

/** Registro público: crea el usuario e inicia su sesión. Luego acepta la política y configura su cuenta. */
export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  if (!registrationOpen()) return { error: "El registro de usuarios nuevos está cerrado." };
  const values = {
    name: String(formData.get("name") ?? "").slice(0, 60),
    username: String(formData.get("username") ?? "").trim().toLowerCase().slice(0, 40),
  };
  const password = String(formData.get("password") ?? "");
  // Campo trampa invisible: solo un bot lo llena.
  if (String(formData.get("sitio") ?? "") !== "") return { values, error: "No se pudo crear la cuenta." };
  if (password !== String(formData.get("confirm") ?? "")) {
    return { values, fieldErrors: { confirm: "Las contraseñas no coinciden" } };
  }
  const ip = await clientIp();
  if (await isRegistrationLimited(db, ip)) {
    return { values, error: "Se crearon demasiadas cuentas desde esta conexión. Intenta más tarde." };
  }

  let user: { id: string; sessionVersion: number };
  try {
    user = await createUser(db, { ...values, password });
  } catch (error) {
    if (error instanceof DomainError) {
      return { values, error: error.field ? undefined : error.message, fieldErrors: error.field ? { [error.field]: error.message } : undefined };
    }
    console.error("[finora] error al registrar usuario:", error);
    return { values, error: "Ocurrió un error inesperado. Intenta de nuevo." };
  }
  await recordRegistration(db, ip);
  const { value, expires } = await createSessionToken(user.id, user.sessionVersion);
  (await cookies()).set(SESSION_COOKIE, value, { ...SESSION_COOKIE_OPTIONS, expires });
  redirect("/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/** Acepta la política de tratamiento de datos vigente y entra a la app. */
export async function acceptPrivacyAction(formData: FormData) {
  if (formData.get("acepto") !== "si") redirect("/privacidad/aceptar?falta=1");
  const userId = await requireActionUser({ allowPendingPrivacy: true });
  await acceptPrivacyPolicy(db, userId);
  redirect("/");
}

/** Cierra la sesión en todos los dispositivos (incluido este). */
export async function revokeAllSessionsAction() {
  try {
    const userId = await requireActionUser({ allowPendingPrivacy: true });
    await revokeAllSessions(db, userId);
  } catch (error) {
    return toFailure(error);
  }
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

/** Elimina la cuenta y todos los datos del usuario. Exige escribir el nombre de usuario. */
export async function deleteAccountAction(confirmUsername: string) {
  const result = await runAction(z.string().max(60), confirmUsername, async (confirm, userId) => {
    await deleteUserAccount(db, userId, confirm);
    return { deleted: true };
  });
  if (!result.ok) return result;
  (await cookies()).delete(SESSION_COOKIE);
  redirect(authMode() === "enabled" ? "/login?cuenta=eliminada" : "/");
}

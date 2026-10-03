"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireActionUser } from "../auth/guard";
import { verifyPassword } from "../auth/password";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, authMode, createSessionToken } from "../auth/session";
import { db } from "../db";
import {
  acceptPrivacyPolicy,
  clearLoginFailures,
  deleteUserAccount,
  isLoginLocked,
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

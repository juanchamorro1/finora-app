"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPassword } from "../auth/password";
import { SESSION_COOKIE, authMode, createSessionToken } from "../auth/session";

// Freno simple contra intentos repetidos (por instancia del servidor).
let failures = 0;
let lockedUntil = 0;

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const mode = authMode();
  if (mode === "disabled") redirect("/");
  if (mode === "misconfigured") return { error: "La app no tiene contraseña configurada (revisa las variables de entorno)." };

  if (Date.now() < lockedUntil) {
    return { error: "Demasiados intentos. Espera un minuto e inténtalo de nuevo." };
  }
  const password = String(formData.get("password") ?? "");
  const ok = password.length > 0 && password.length <= 200 && (await verifyPassword(password, process.env.FINORA_PASSWORD_HASH!));
  if (!ok) {
    failures++;
    if (failures >= 5) {
      lockedUntil = Date.now() + 60_000;
      failures = 0;
    }
    await new Promise((r) => setTimeout(r, 700));
    return { error: "Contraseña incorrecta." };
  }

  failures = 0;
  const { value, expires } = await createSessionToken();
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

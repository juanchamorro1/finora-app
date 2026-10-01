import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, authMode, verifySessionToken } from "./session";

/** ¿La petición actual tiene acceso? (siempre sí si la autenticación está desactivada en local). */
export async function hasSession(): Promise<boolean> {
  const mode = authMode();
  if (mode === "disabled") return true;
  if (mode === "misconfigured") return false;
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Para páginas: redirige al inicio de sesión si no hay sesión válida. */
export async function requirePageSession(): Promise<void> {
  if (!(await hasSession())) redirect("/login");
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Tu sesión expiró. Vuelve a iniciar sesión.");
    this.name = "UnauthorizedError";
  }
}

/** Para Server Actions: lanza si no hay sesión válida. */
export async function requireActionSession(): Promise<void> {
  if (!(await hasSession())) throw new UnauthorizedError();
}

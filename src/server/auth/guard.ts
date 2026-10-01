import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db";
import { SESSION_COOKIE, authMode, verifySessionToken } from "./session";

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
}

const userSelect = { id: true, username: true, name: true } as const;

/**
 * Usuario de la petición actual (o null). Verifica la firma de la cookie y que
 * el usuario siga existiendo. Con la autenticación desactivada (desarrollo sin
 * FINORA_SESSION_SECRET) usa el primer usuario, creándolo si no hay ninguno.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const mode = authMode();
  if (mode === "misconfigured") return null;
  if (mode === "disabled") {
    const first = await db.user.findFirst({ select: userSelect, orderBy: { createdAt: "asc" } });
    return (
      first ??
      db.user.create({ data: { username: "local", name: "Yo", passwordHash: "LOCAL" }, select: userSelect })
    );
  }
  const userId = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  return db.user.findUnique({ where: { id: userId }, select: userSelect });
});

/** Para páginas: devuelve el usuario o redirige al inicio de sesión. */
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Tu sesión expiró. Vuelve a iniciar sesión.");
    this.name = "UnauthorizedError";
  }
}

/** Para Server Actions: devuelve el id del usuario o lanza si no hay sesión válida. */
export async function requireActionUser(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user.id;
}

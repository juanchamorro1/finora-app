import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { PRIVACY_VERSION } from "@/lib/privacy";
import { db } from "../db";
import { SESSION_COOKIE, authMode, verifySessionToken } from "./session";

export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  sessionVersion: number;
  /** ¿Aceptó la versión vigente de la política de tratamiento de datos? */
  privacyAccepted: boolean;
}

const userSelect = { id: true, username: true, name: true, sessionVersion: true, privacyVersion: true } as const;

function toCurrentUser(u: { id: string; username: string; name: string; sessionVersion: number; privacyVersion: number | null }): CurrentUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    sessionVersion: u.sessionVersion,
    privacyAccepted: (u.privacyVersion ?? 0) >= PRIVACY_VERSION,
  };
}

/**
 * Usuario de la petición actual (o null). Verifica la firma de la cookie, que
 * el usuario siga existiendo y que la sesión no haya sido revocada (versión).
 * Con la autenticación desactivada (desarrollo sin FINORA_SESSION_SECRET) usa
 * el primer usuario, creándolo si no hay ninguno.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const mode = authMode();
  if (mode === "misconfigured") return null;
  if (mode === "disabled") {
    const first =
      (await db.user.findFirst({ select: userSelect, orderBy: { createdAt: "asc" } })) ??
      (await db.user.create({ data: { username: "local", name: "Yo", passwordHash: "LOCAL" }, select: userSelect }));
    return toCurrentUser(first);
  }
  const claims = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = await db.user.findUnique({ where: { id: claims.userId }, select: userSelect });
  if (!user || user.sessionVersion !== claims.version) return null;
  return toCurrentUser(user);
});

/**
 * Para páginas: devuelve el usuario o redirige al inicio de sesión. Si aún no
 * aceptó la política de datos vigente, lo lleva a aceptarla primero.
 */
export async function requirePageUser(opts: { allowPendingPrivacy?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.privacyAccepted && !opts.allowPendingPrivacy) redirect("/privacidad/aceptar");
  return user;
}

export class UnauthorizedError extends Error {
  constructor(message = "Tu sesión expiró. Vuelve a iniciar sesión.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Para Server Actions: devuelve el id del usuario o lanza si no hay sesión válida. */
export async function requireActionUser(opts: { allowPendingPrivacy?: boolean } = {}): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.privacyAccepted && !opts.allowPendingPrivacy) {
    throw new UnauthorizedError("Primero debes aceptar la política de tratamiento de datos.");
  }
  return user.id;
}

import { PRIVACY_VERSION, TRASH_RETENTION_DAYS } from "@/lib/privacy";
import { withTx, type Db, type DbTx } from "../db-client";
import { assertDomain } from "../errors";

// ---------------------------------------------------------------------------
// Política de datos y sesiones
// ---------------------------------------------------------------------------

export async function acceptPrivacyPolicy(db: Db | DbTx, userId: string, now: Date = new Date()) {
  await db.user.update({ where: { id: userId }, data: { privacyVersion: PRIVACY_VERSION, privacyAcceptedAt: now } });
}

/** Invalida todas las sesiones abiertas del usuario (en todos los dispositivos). */
export async function revokeAllSessions(db: Db | DbTx, userId: string): Promise<number> {
  const user = await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  return user.sessionVersion;
}

// ---------------------------------------------------------------------------
// Freno de intentos de inicio de sesión (compartido entre servidores)
// ---------------------------------------------------------------------------

export const MAX_LOGIN_FAILURES = 5;
export const LOGIN_LOCK_MS = 60_000;

export async function isLoginLocked(db: Db | DbTx, username: string, now: Date = new Date()): Promise<boolean> {
  const attempt = await db.loginAttempt.findUnique({ where: { username } });
  return Boolean(attempt?.lockedUntil && attempt.lockedUntil > now);
}

export async function registerLoginFailure(db: Db | DbTx, username: string, now: Date = new Date()) {
  const attempt = await db.loginAttempt.upsert({
    where: { username },
    create: { username, failures: 1 },
    update: { failures: { increment: 1 } },
  });
  if (attempt.failures >= MAX_LOGIN_FAILURES) {
    await db.loginAttempt.update({
      where: { username },
      data: { failures: 0, lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MS) },
    });
  }
}

export async function clearLoginFailures(db: Db | DbTx, username: string) {
  await db.loginAttempt.deleteMany({ where: { username } });
}

// ---------------------------------------------------------------------------
// Papelera
// ---------------------------------------------------------------------------

/** Borra definitivamente los movimientos que llevan más de 30 días en la papelera. */
export async function purgeExpiredTrash(db: Db | DbTx, userId: string, now: Date = new Date()): Promise<number> {
  const limit = new Date(now.getTime() - TRASH_RETENTION_DAYS * 86_400_000);
  const { count } = await db.transaction.deleteMany({ where: { userId, deletedAt: { lt: limit } } });
  return count;
}

// ---------------------------------------------------------------------------
// Derechos del titular: conocer (exportar) y suprimir (eliminar cuenta)
// ---------------------------------------------------------------------------

/** Convierte BigInt y fechas a valores JSON legibles. */
function plain<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

/**
 * Todos los datos personales del usuario en un objeto JSON.
 * Los montos se exportan como texto en unidades mínimas (COP = pesos).
 */
export async function exportUserData(db: Db, userId: string, now: Date = new Date()) {
  const [user, accounts, categories, transactions, budgets, goals, rates, settings] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { username: true, name: true, createdAt: true, privacyVersion: true, privacyAcceptedAt: true },
    }),
    db.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.category.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    db.transaction.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    db.budget.findMany({ where: { category: { userId } } }),
    db.savingsGoal.findMany({ where: { userId }, include: { contributions: true } }),
    db.exchangeRate.findMany({ where: { userId } }),
    db.setting.findMany({ where: { userId } }),
  ]);
  // El id interno del usuario no aporta nada al titular: se omite.
  const strip = <R extends { userId?: string }>(rows: R[]) =>
    rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "userId")));
  return plain({
    exportadoEl: now.toISOString(),
    nota: "Montos en unidades mínimas de la moneda de cada cuenta (COP = pesos enteros).",
    usuario: user,
    cuentas: strip(accounts),
    categorias: strip(categories),
    movimientos: strip(transactions),
    presupuestos: budgets,
    metas: strip(goals),
    tasasDeCambio: strip(rates),
    ajustes: strip(settings),
  }) as Record<string, unknown>;
}

/**
 * Elimina al usuario y TODOS sus datos, de forma definitiva, en una sola
 * transacción (el orden respeta las claves foráneas).
 */
export async function deleteUserAccount(db: Db, userId: string, confirmUsername: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  assertDomain(user, "El usuario no existe");
  assertDomain(
    confirmUsername.trim().toLowerCase() === user.username,
    "Escribe tu nombre de usuario exactamente para confirmar",
    "confirm",
  );
  await withTx(db, async (tx) => {
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.savingsGoal.deleteMany({ where: { userId } }); // los aportes se borran en cascada
    await tx.budget.deleteMany({ where: { category: { userId } } });
    await tx.category.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.exchangeRate.deleteMany({ where: { userId } });
    await tx.setting.deleteMany({ where: { userId } });
    await tx.loginAttempt.deleteMany({ where: { username: user.username } });
    await tx.user.delete({ where: { id: userId } });
  });
}

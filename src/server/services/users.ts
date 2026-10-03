import { PRIVACY_VERSION, TRASH_RETENTION_DAYS } from "@/lib/privacy";
import { hashPassword } from "../auth/password";
import { withTx, type Db, type DbTx } from "../db-client";
import { DomainError, assertDomain } from "../errors";

// ---------------------------------------------------------------------------
// Registro de usuarios nuevos
// ---------------------------------------------------------------------------

export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
export const MIN_PASSWORD_LENGTH = 10;
/** Cuentas nuevas permitidas por dirección IP y por hora (freno contra bots). */
export const MAX_REGISTRATIONS_PER_HOUR = 5;

export interface NewUserInput {
  username: string;
  name: string;
  password: string;
}

/**
 * Crea un usuario con contraseña. La política de datos se acepta después,
 * en /privacidad/aceptar, antes de poder usar la app.
 */
export async function createUser(db: Db | DbTx, input: NewUserInput) {
  const username = input.username.trim().toLowerCase();
  const name = input.name.trim();
  assertDomain(name.length > 0, "Escribe tu nombre", "name");
  assertDomain(name.length <= 40, "Máximo 40 caracteres", "name");
  assertDomain(
    USERNAME_PATTERN.test(username),
    "Usa de 3 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo",
    "username",
  );
  assertDomain(
    input.password.length >= MIN_PASSWORD_LENGTH,
    `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`,
    "password",
  );
  assertDomain(input.password.length <= 200, "La contraseña es demasiado larga", "password");
  const taken = () => new DomainError("Ese usuario ya existe. Prueba con otro.", "username");
  if (await db.user.findUnique({ where: { username } })) throw taken();
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.user.create({ data: { username, name, passwordHash }, select: { id: true, sessionVersion: true } });
  } catch (error) {
    // Dos registros simultáneos con el mismo usuario: gana el primero.
    if ((error as { code?: string }).code === "P2002") throw taken();
    throw error;
  }
}

const registrationKey = (ip: string) => `registro:${ip.slice(0, 100)}`;

/** ¿Esta IP ya creó demasiadas cuentas en la última hora? */
export async function isRegistrationLimited(db: Db | DbTx, ip: string, now: Date = new Date()): Promise<boolean> {
  const row = await db.loginAttempt.findUnique({ where: { username: registrationKey(ip) } });
  return Boolean(row?.lockedUntil && row.lockedUntil > now && row.failures >= MAX_REGISTRATIONS_PER_HOUR);
}

/** Cuenta un registro de esta IP dentro de una ventana de una hora. */
export async function recordRegistration(db: Db | DbTx, ip: string, now: Date = new Date()) {
  const key = registrationKey(ip);
  const row = await db.loginAttempt.findUnique({ where: { username: key } });
  if (row?.lockedUntil && row.lockedUntil > now) {
    await db.loginAttempt.update({ where: { username: key }, data: { failures: { increment: 1 } } });
  } else {
    const windowEnd = new Date(now.getTime() + 3_600_000);
    await db.loginAttempt.upsert({
      where: { username: key },
      create: { username: key, failures: 1, lockedUntil: windowEnd },
      update: { failures: 1, lockedUntil: windowEnd },
    });
  }
}

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

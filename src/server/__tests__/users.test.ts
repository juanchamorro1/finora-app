import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db-client";
import { createTestDb, createTestUser } from "./test-db";
import { createAccount } from "../services/accounts";
import { ensureDefaultCategories } from "../services/categories";
import { createGoal, addContribution } from "../services/goals";
import { setBudget } from "../services/budgets";
import { createTransaction, trashTransaction } from "../services/transactions";
import { verifyPassword } from "../auth/password";
import {
  MAX_REGISTRATIONS_PER_HOUR,
  acceptPrivacyPolicy,
  clearLoginFailures,
  createUser,
  deleteUserAccount,
  exportUserData,
  isLoginLocked,
  isRegistrationLimited,
  purgeExpiredTrash,
  recordRegistration,
  registerLoginFailure,
  revokeAllSessions,
} from "../services/users";
import { PRIVACY_VERSION } from "@/lib/privacy";

describe("privacidad, sesiones y derechos del titular", () => {
  let db: Db;
  let uid: string;
  let otro: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ db, cleanup, userId: uid } = await createTestDb());
    otro = await createTestUser(db, "otro");
    for (const u of [uid, otro]) {
      await ensureDefaultCategories(db, u);
      const acc = (await createAccount(db, u, { name: "Nequi", type: "DIGITAL_WALLET", currency: "COP", openingBalance: 100_000n })).id;
      const comida = (await db.category.findFirstOrThrow({ where: { userId: u, name: "Comida", kind: "EXPENSE" } })).id;
      await createTransaction(db, u, { type: "EXPENSE", amount: 8_000n, accountId: acc, categoryId: comida, date: new Date() });
      await setBudget(db, u, comida, 200_000n);
      const goal = await createGoal(db, u, { name: "Viaje", targetAmount: 500_000n, accountId: acc, initialSaved: 10_000n });
      await addContribution(db, u, goal.id, 5_000n);
    }
  });
  afterEach(() => cleanup());

  it("registra la aceptación de la política", async () => {
    await acceptPrivacyPolicy(db, uid);
    const user = await db.user.findUniqueOrThrow({ where: { id: uid } });
    expect(user.privacyVersion).toBe(PRIVACY_VERSION);
    expect(user.privacyAcceptedAt).toBeInstanceOf(Date);
  });

  it("cerrar todas las sesiones sube la versión", async () => {
    expect(await revokeAllSessions(db, uid)).toBe(1);
    expect(await revokeAllSessions(db, uid)).toBe(2);
  });

  it("bloquea el inicio de sesión tras 5 fallos y se limpia al acertar", async () => {
    const now = new Date();
    for (let i = 0; i < 4; i++) await registerLoginFailure(db, "juan", now);
    expect(await isLoginLocked(db, "juan", now)).toBe(false);
    await registerLoginFailure(db, "juan", now);
    expect(await isLoginLocked(db, "juan", now)).toBe(true);
    expect(await isLoginLocked(db, "juan", new Date(now.getTime() + 61_000))).toBe(false);
    expect(await isLoginLocked(db, "mama", now)).toBe(false);
    await clearLoginFailures(db, "juan");
    expect(await db.loginAttempt.count()).toBe(0);
  });

  it("vacía solo la papelera vencida (más de 30 días) y solo del usuario", async () => {
    const tx = await db.transaction.findFirstOrThrow({ where: { userId: uid, type: "EXPENSE" } });
    await trashTransaction(db, uid, tx.id);
    const now = new Date();
    expect(await purgeExpiredTrash(db, uid, new Date(now.getTime() + 29 * 86_400_000))).toBe(0);
    expect(await purgeExpiredTrash(db, otro, new Date(now.getTime() + 31 * 86_400_000))).toBe(0);
    expect(await purgeExpiredTrash(db, uid, new Date(now.getTime() + 31 * 86_400_000))).toBe(1);
  });

  it("exporta todos los datos del usuario y ninguno de otros", async () => {
    const data = await exportUserData(db, uid);
    const json = JSON.stringify(data);
    expect((data.cuentas as unknown[]).length).toBe(1);
    expect((data.movimientos as unknown[]).length).toBe(2); // saldo inicial + gasto
    expect((data.metas as { contributions: unknown[] }[])[0].contributions).toHaveLength(2);
    expect(json).not.toContain(otro);
    expect(json).not.toContain("passwordHash");
    expect(json).toContain('"amount":"8000"');
  });

  it("eliminar la cuenta borra todo del usuario y nada de los demás", async () => {
    await expect(deleteUserAccount(db, uid, "otro")).rejects.toThrow(/exactamente/);
    await deleteUserAccount(db, uid, " PRUEBA ");
    expect(await db.user.findUnique({ where: { id: uid } })).toBeNull();
    for (const model of ["account", "category", "transaction", "savingsGoal", "setting"] as const) {
      // @ts-expect-error acceso dinámico a modelos con el mismo filtro
      expect(await db[model].count({ where: { userId: uid } })).toBe(0);
    }
    expect(await db.budget.count({ where: { category: { userId: uid } } })).toBe(0);
    expect(await db.goalContribution.count({ where: { goal: { userId: uid } } })).toBe(0);
    // El otro usuario queda intacto.
    expect(await db.transaction.count({ where: { userId: otro } })).toBe(2);
    expect(await db.budget.count({ where: { category: { userId: otro } } })).toBe(1);
  });

  it("registra usuarios nuevos con contraseña cifrada y sin política aceptada", async () => {
    const user = await createUser(db, { username: " Maria.Gomez ", name: " María ", password: "una-clave-larga" });
    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved.username).toBe("maria.gomez");
    expect(saved.name).toBe("María");
    expect(saved.privacyVersion).toBeNull();
    expect(saved.passwordHash).not.toContain("una-clave-larga");
    expect(await verifyPassword("una-clave-larga", saved.passwordHash)).toBe(true);
  });

  it("valida usuario, nombre y contraseña, y no repite usuarios", async () => {
    const ok = { username: "nuevo", name: "Nuevo", password: "0123456789" };
    await expect(createUser(db, { ...ok, username: "a b" })).rejects.toMatchObject({ field: "username" });
    await expect(createUser(db, { ...ok, name: "  " })).rejects.toMatchObject({ field: "name" });
    await expect(createUser(db, { ...ok, password: "corta" })).rejects.toMatchObject({ field: "password" });
    await createUser(db, ok);
    await expect(createUser(db, { ...ok, username: "NUEVO" })).rejects.toThrow(/ya existe/);
    await expect(createUser(db, { ...ok, username: "prueba" })).rejects.toThrow(/ya existe/);
  });

  it("limita las cuentas nuevas por IP durante una hora", async () => {
    const now = new Date();
    for (let i = 0; i < MAX_REGISTRATIONS_PER_HOUR; i++) {
      expect(await isRegistrationLimited(db, "1.2.3.4", now)).toBe(false);
      await recordRegistration(db, "1.2.3.4", now);
    }
    expect(await isRegistrationLimited(db, "1.2.3.4", now)).toBe(true);
    expect(await isRegistrationLimited(db, "5.6.7.8", now)).toBe(false);
    expect(await isRegistrationLimited(db, "1.2.3.4", new Date(now.getTime() + 3_601_000))).toBe(false);
  });
});

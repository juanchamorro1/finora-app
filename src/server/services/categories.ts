import type { CategoryKind } from "@/generated/prisma/enums";
import { sameName } from "@/lib/text";
import type { Db, DbTx } from "../db-client";
import { DomainError, assertDomain } from "../errors";
import { DEFAULT_CATEGORIES, SYSTEM_CATEGORIES, type SystemCategoryKey } from "./defaults";

/** Categoría del usuario o error "no existe". */
export async function getOwnCategory(db: Db | DbTx, userId: string, id: string, field?: string) {
  const category = await db.category.findFirst({ where: { id, userId } });
  assertDomain(category, "La categoría no existe", field);
  return category;
}

/** Crea las categorías predeterminadas que falten (idempotente). */
export async function ensureDefaultCategories(db: Db | DbTx, userId: string): Promise<number> {
  let created = 0;
  for (const [index, cat] of DEFAULT_CATEGORIES.entries()) {
    const existing = await db.category.findUnique({
      where: { userId_name_kind: { userId, name: cat.name, kind: cat.kind } },
    });
    if (!existing) {
      await db.category.create({ data: { ...cat, userId, isDefault: true, sortOrder: index } });
      created++;
    }
  }
  return created;
}

/**
 * Categoría del sistema (ej. la de aportes a metas), creándola si no existe.
 * Si el usuario ya tenía una con el mismo nombre y tipo, se reutiliza.
 */
export async function ensureSystemCategory(db: Db | DbTx, userId: string, key: SystemCategoryKey) {
  const existing = await db.category.findFirst({ where: { userId, systemKey: key } });
  if (existing) return existing;
  const def = SYSTEM_CATEGORIES[key];
  const sameNamed = await db.category.findUnique({ where: { userId_name_kind: { userId, name: def.name, kind: def.kind } } });
  if (sameNamed) return db.category.update({ where: { id: sameNamed.id }, data: { systemKey: key, isArchived: false } });
  return db.category.create({ data: { ...def, userId, systemKey: key, isDefault: true, sortOrder: 1000 } });
}

export async function listCategories(
  db: Db | DbTx,
  userId: string,
  opts: { kind?: CategoryKind; includeArchived?: boolean } = {},
) {
  return db.category.findMany({
    where: { userId, kind: opts.kind, isArchived: opts.includeArchived ? undefined : false },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
  icon?: string;
  color?: string;
}

async function assertNameAvailable(db: Db | DbTx, userId: string, name: string, kind: CategoryKind, exceptId?: string) {
  const sameKind = await db.category.findMany({ where: { userId, kind }, select: { id: true, name: true } });
  const clash = sameKind.find((c) => c.id !== exceptId && sameName(c.name, name));
  if (clash) {
    throw new DomainError(`Ya existe una categoría de ${kind === "INCOME" ? "ingreso" : "gasto"} llamada "${name}"`, "name");
  }
}

export async function createCategory(db: Db | DbTx, userId: string, input: CategoryInput) {
  const name = input.name.trim();
  assertDomain(name.length > 0, "El nombre es obligatorio", "name");
  await assertNameAvailable(db, userId, name, input.kind);
  const last = await db.category.findFirst({ where: { userId, kind: input.kind }, orderBy: { sortOrder: "desc" } });
  return db.category.create({
    data: { userId, name, kind: input.kind, icon: input.icon, color: input.color, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
}

/** El tipo (ingreso/gasto) no se puede cambiar: rompería los movimientos existentes. */
export async function updateCategory(db: Db | DbTx, userId: string, id: string, input: Omit<CategoryInput, "kind">) {
  const category = await getOwnCategory(db, userId, id);
  const name = input.name.trim();
  assertDomain(name.length > 0, "El nombre es obligatorio", "name");
  await assertNameAvailable(db, userId, name, category.kind, id);
  return db.category.update({ where: { id }, data: { name, icon: input.icon, color: input.color } });
}

export async function setCategoryArchived(db: Db | DbTx, userId: string, id: string, archived: boolean) {
  await getOwnCategory(db, userId, id);
  return db.category.update({ where: { id }, data: { isArchived: archived } });
}

/** Solo se puede eliminar una categoría sin movimientos; si tiene, se archiva. */
export async function deleteCategory(db: Db | DbTx, userId: string, id: string) {
  await getOwnCategory(db, userId, id);
  const used = await db.transaction.count({ where: { categoryId: id } });
  if (used > 0) {
    throw new DomainError(`La categoría tiene ${used} movimiento(s). Archívala en lugar de eliminarla.`);
  }
  await db.category.delete({ where: { id } });
}

/** Categorías con su número de movimientos (para decidir entre eliminar o archivar). */
export async function listCategoriesWithUsage(db: Db | DbTx, userId: string) {
  const categories = await db.category.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { isArchived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } }, budget: { select: { id: true } } },
  });
  return categories.map(({ _count, budget, ...c }) => ({ ...c, transactionCount: _count.transactions, hasBudget: Boolean(budget) }));
}

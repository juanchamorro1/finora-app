import type { CategoryKind } from "@/generated/prisma/enums";
import type { Db, DbTx } from "../db-client";
import { sameName } from "@/lib/text";
import { DomainError, assertDomain } from "../errors";
import { DEFAULT_CATEGORIES } from "./defaults";

/** Crea las categorías predeterminadas que falten (idempotente). */
export async function ensureDefaultCategories(db: Db | DbTx): Promise<number> {
  let created = 0;
  for (const [index, cat] of DEFAULT_CATEGORIES.entries()) {
    const existing = await db.category.findUnique({ where: { name_kind: { name: cat.name, kind: cat.kind } } });
    if (!existing) {
      await db.category.create({ data: { ...cat, isDefault: true, sortOrder: index } });
      created++;
    }
  }
  return created;
}

export async function listCategories(db: Db | DbTx, opts: { kind?: CategoryKind; includeArchived?: boolean } = {}) {
  return db.category.findMany({
    where: { kind: opts.kind, isArchived: opts.includeArchived ? undefined : false },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
}

export interface CategoryInput {
  name: string;
  kind: CategoryKind;
  icon?: string;
  color?: string;
}

async function assertNameAvailable(db: Db | DbTx, name: string, kind: CategoryKind, exceptId?: string) {
  const sameKind = await db.category.findMany({ where: { kind }, select: { id: true, name: true } });
  const clash = sameKind.find((c) => c.id !== exceptId && sameName(c.name, name));
  if (clash) {
    throw new DomainError(`Ya existe una categoría de ${kind === "INCOME" ? "ingreso" : "gasto"} llamada "${name}"`, "name");
  }
}

export async function createCategory(db: Db | DbTx, input: CategoryInput) {
  const name = input.name.trim();
  assertDomain(name.length > 0, "El nombre es obligatorio", "name");
  await assertNameAvailable(db, name, input.kind);
  const last = await db.category.findFirst({ where: { kind: input.kind }, orderBy: { sortOrder: "desc" } });
  return db.category.create({
    data: { name, kind: input.kind, icon: input.icon, color: input.color, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
}

/** El tipo (ingreso/gasto) no se puede cambiar: rompería los movimientos existentes. */
export async function updateCategory(db: Db | DbTx, id: string, input: Omit<CategoryInput, "kind">) {
  const category = await db.category.findUnique({ where: { id } });
  assertDomain(category, "La categoría no existe");
  const name = input.name.trim();
  assertDomain(name.length > 0, "El nombre es obligatorio", "name");
  await assertNameAvailable(db, name, category.kind, id);
  return db.category.update({ where: { id }, data: { name, icon: input.icon, color: input.color } });
}

export async function setCategoryArchived(db: Db | DbTx, id: string, archived: boolean) {
  const category = await db.category.findUnique({ where: { id } });
  assertDomain(category, "La categoría no existe");
  return db.category.update({ where: { id }, data: { isArchived: archived } });
}

/** Solo se puede eliminar una categoría sin movimientos; si tiene, se archiva. */
export async function deleteCategory(db: Db | DbTx, id: string) {
  const used = await db.transaction.count({ where: { categoryId: id } });
  if (used > 0) {
    throw new DomainError(`La categoría tiene ${used} movimiento(s). Archívala en lugar de eliminarla.`);
  }
  await db.category.delete({ where: { id } });
}

/** Categorías con su número de movimientos (para decidir entre eliminar o archivar). */
export async function listCategoriesWithUsage(db: Db | DbTx) {
  const categories = await db.category.findMany({
    orderBy: [{ kind: "asc" }, { isArchived: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } }, budget: { select: { id: true } } },
  });
  return categories.map(({ _count, budget, ...c }) => ({ ...c, transactionCount: _count.transactions, hasBudget: Boolean(budget) }));
}

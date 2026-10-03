import type { Prisma } from "@/generated/prisma/client";
import type { TransactionType } from "@/generated/prisma/enums";
import { withTx, type Db, type DbTx } from "../db-client";
import { DomainError, assertDomain } from "../errors";
import { ACTIVE_TX } from "./ledger";

/** Tipos que el usuario registra a mano. OPENING_BALANCE y ADJUSTMENT los crea el sistema. */
export type UserTransactionType = Extract<TransactionType, "INCOME" | "EXPENSE" | "TRANSFER">;

export interface TransactionInput {
  type: UserTransactionType;
  /** Unidades mínimas de la moneda de la cuenta (> 0). */
  amount: bigint;
  accountId: string;
  toAccountId?: string | null;
  /** Solo si las monedas de origen y destino difieren. */
  toAmount?: bigint | null;
  categoryId?: string | null;
  date: Date;
  description?: string | null;
  note?: string | null;
}

export const DESCRIPTION_MAX = 120;
export const NOTE_MAX = 500;

const transactionInclude = {
  account: { select: { id: true, name: true, currency: true, type: true } },
  toAccount: { select: { id: true, name: true, currency: true, type: true } },
  category: { select: { id: true, name: true, icon: true, color: true, kind: true } },
} satisfies Prisma.TransactionInclude;

export type TransactionWithRelations = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

/**
 * Valida y normaliza un movimiento. Reglas:
 * - monto > 0
 * - ingreso/gasto: categoría del mismo tipo, sin cuenta destino
 * - transferencia: cuenta destino distinta, sin categoría; si cambian las monedas se exige toAmount
 * - no se registran movimientos nuevos en cuentas inactivas ni con categorías archivadas
 */
async function normalize(
  db: Db | DbTx,
  userId: string,
  input: TransactionInput,
  existing?: TransactionWithRelations,
): Promise<Prisma.TransactionUncheckedCreateInput> {
  assertDomain(["INCOME", "EXPENSE", "TRANSFER"].includes(input.type), "Tipo de movimiento inválido", "type");
  assertDomain(input.amount > 0n, "El monto debe ser mayor a 0", "amount");
  assertDomain(!Number.isNaN(input.date.getTime()), "Fecha inválida", "date");

  // Las cuentas y categorías deben ser del mismo usuario.
  const account = await db.account.findFirst({ where: { id: input.accountId, userId } });
  assertDomain(account, "La cuenta no existe", "accountId");
  // Permite editar movimientos antiguos de una cuenta ya desactivada, pero no crear nuevos.
  const accountChanged = existing?.accountId !== input.accountId;
  assertDomain(account.isActive || !accountChanged, `La cuenta "${account.name}" está inactiva`, "accountId");

  const note = input.note?.trim() || null;
  assertDomain(!note || note.length <= NOTE_MAX, `La nota admite máximo ${NOTE_MAX} caracteres`, "note");

  if (input.type === "TRANSFER") {
    assertDomain(input.toAccountId, "Selecciona la cuenta destino", "toAccountId");
    assertDomain(input.toAccountId !== input.accountId, "La cuenta destino debe ser diferente a la de origen", "toAccountId");
    const toAccount = await db.account.findFirst({ where: { id: input.toAccountId, userId } });
    assertDomain(toAccount, "La cuenta destino no existe", "toAccountId");
    const toChanged = existing?.toAccountId !== input.toAccountId;
    assertDomain(toAccount.isActive || !toChanged, `La cuenta "${toAccount.name}" está inactiva`, "toAccountId");

    let toAmount = input.amount;
    if (toAccount.currency !== account.currency) {
      assertDomain(
        input.toAmount && input.toAmount > 0n,
        `Indica cuánto llega a ${toAccount.name} (${toAccount.currency})`,
        "toAmount",
      );
      toAmount = input.toAmount;
    }
    const description = input.description?.trim() || `${account.name} → ${toAccount.name}`;
    assertDomain(description.length <= DESCRIPTION_MAX, `Máximo ${DESCRIPTION_MAX} caracteres`, "description");
    return {
      userId,
      type: "TRANSFER",
      amount: input.amount,
      accountId: account.id,
      toAccountId: toAccount.id,
      toAmount,
      categoryId: null,
      date: input.date,
      description,
      note,
    };
  }

  assertDomain(input.categoryId, "Selecciona una categoría", "categoryId");
  const category = await db.category.findFirst({ where: { id: input.categoryId, userId } });
  assertDomain(category, "La categoría no existe", "categoryId");
  assertDomain(
    category.kind === input.type,
    input.type === "INCOME" ? "Elige una categoría de ingreso" : "Elige una categoría de gasto",
    "categoryId",
  );
  const categoryChanged = existing?.categoryId !== input.categoryId;
  assertDomain(!category.isArchived || !categoryChanged, `La categoría "${category.name}" está archivada`, "categoryId");
  assertDomain(
    !category.systemKey || !categoryChanged,
    `"${category.name}" se usa solo para los aportes a metas: apórtale desde Metas`,
    "categoryId",
  );

  const description = input.description?.trim() || category.name;
  assertDomain(description.length <= DESCRIPTION_MAX, `Máximo ${DESCRIPTION_MAX} caracteres`, "description");
  return {
    userId,
    type: input.type,
    amount: input.amount,
    accountId: account.id,
    toAccountId: null,
    toAmount: null,
    categoryId: category.id,
    date: input.date,
    description,
    note,
  };
}

export async function createTransaction(db: Db, userId: string, input: TransactionInput): Promise<TransactionWithRelations> {
  return withTx(db, async (tx) => {
    const data = await normalize(tx, userId, input);
    return tx.transaction.create({ data, include: transactionInclude });
  });
}

export async function getTransaction(db: Db | DbTx, userId: string, id: string): Promise<TransactionWithRelations | null> {
  return db.transaction.findFirst({ where: { id, userId }, include: transactionInclude });
}

export async function updateTransaction(
  db: Db,
  userId: string,
  id: string,
  input: TransactionInput,
): Promise<TransactionWithRelations> {
  return withTx(db, async (tx) => {
    const existing = await getTransaction(tx, userId, id);
    assertDomain(existing && !existing.deletedAt, "El movimiento no existe o está en la papelera");
    if (existing.type === "OPENING_BALANCE" || existing.type === "ADJUSTMENT") {
      throw new DomainError("Los saldos iniciales y ajustes se modifican desde la cuenta");
    }
    await assertNotGoalMovement(tx, id);
    const data = await normalize(tx, userId, input, existing);
    return tx.transaction.update({ where: { id }, data, include: transactionInclude });
  });
}

/** Los aportes y retiros de metas se gestionan desde Metas (para que la meta y la cuenta cuadren). */
async function assertNotGoalMovement(db: Db | DbTx, transactionId: string) {
  const contribution = await db.goalContribution.findUnique({
    where: { transactionId },
    select: { goal: { select: { name: true } } },
  });
  if (contribution) {
    throw new DomainError(`Este movimiento es de la meta "${contribution.goal.name}": gestiónalo desde Metas`);
  }
}

/** Envía el movimiento a la papelera (recuperable). El saldo se recalcula solo. */
export async function trashTransaction(db: Db, userId: string, id: string) {
  const existing = await db.transaction.findFirst({ where: { id, userId } });
  assertDomain(existing && !existing.deletedAt, "El movimiento no existe o ya está en la papelera");
  await assertNotGoalMovement(db, id);
  return db.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
}

export async function restoreTransaction(db: Db, userId: string, id: string) {
  const existing = await db.transaction.findFirst({ where: { id, userId } });
  assertDomain(existing?.deletedAt, "El movimiento no está en la papelera");
  return db.transaction.update({ where: { id }, data: { deletedAt: null } });
}

/** Borrado definitivo: solo desde la papelera. */
export async function purgeTransaction(db: Db, userId: string, id: string) {
  const existing = await db.transaction.findFirst({ where: { id, userId } });
  assertDomain(existing?.deletedAt, "Solo se pueden eliminar definitivamente movimientos de la papelera");
  await db.transaction.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Búsqueda y filtros
// ---------------------------------------------------------------------------

export interface TransactionFilters {
  q?: string;
  type?: TransactionType;
  categoryId?: string;
  /** Coincide con la cuenta de origen o destino. */
  accountId?: string;
  from?: Date;
  /** Exclusivo. */
  to?: Date;
  minAmount?: bigint;
  maxAmount?: bigint;
  trashed?: boolean;
}

export function buildTransactionWhere(userId: string, f: TransactionFilters): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [{ userId }, f.trashed ? { deletedAt: { not: null } } : ACTIVE_TX];
  if (f.type) and.push({ type: f.type });
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.accountId) and.push({ OR: [{ accountId: f.accountId }, { toAccountId: f.accountId }] });
  if (f.from || f.to) and.push({ date: { gte: f.from, lt: f.to } });
  if (f.minAmount !== undefined || f.maxAmount !== undefined) {
    // Para saldos iniciales/ajustes (con signo) se filtra por la magnitud.
    and.push({
      OR: [
        { amount: { gte: f.minAmount, lte: f.maxAmount } },
        {
          amount: {
            gte: f.maxAmount !== undefined ? -f.maxAmount : undefined,
            lte: f.minAmount !== undefined ? -f.minAmount : undefined,
          },
          type: { in: ["OPENING_BALANCE", "ADJUSTMENT"] },
        },
      ],
    });
  }
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { description: { contains: q } },
        { note: { contains: q } },
        { category: { name: { contains: q } } },
        { account: { name: { contains: q } } },
      ],
    });
  }
  return { AND: and };
}

export async function searchTransactions(
  db: Db,
  userId: string,
  filters: TransactionFilters,
  page: { take?: number; skip?: number } = {},
): Promise<{ items: TransactionWithRelations[]; total: number }> {
  const where = buildTransactionWhere(userId, filters);
  const [items, total] = await Promise.all([
    db.transaction.findMany({
      where,
      include: transactionInclude,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: page.take ?? 50,
      skip: page.skip ?? 0,
    }),
    db.transaction.count({ where }),
  ]);
  return { items, total };
}

export async function recentTransactions(db: Db, userId: string, take = 6) {
  return (await searchTransactions(db, userId, {}, { take })).items;
}

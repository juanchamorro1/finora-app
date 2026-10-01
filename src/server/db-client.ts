import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

/** Cliente de transacción interactiva (mismo API de modelos que PrismaClient). */
export type DbTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * Crea un cliente. Funciona con un archivo local (`file:./data/finora.db`) o con
 * una base Turso en la nube (`libsql://…` + token). Ambos son SQLite.
 */
export function createDb(url: string, authToken?: string): PrismaClient {
  const adapter = new PrismaLibSql({ url, authToken: authToken || undefined });
  return new PrismaClient({ adapter });
}

/**
 * Ejecuta `fn` dentro de una transacción. Si `db` ya es una transacción,
 * reutiliza la misma (Prisma no admite transacciones interactivas anidadas).
 */
export async function withTx<T>(db: Db | DbTx, fn: (tx: DbTx) => Promise<T>): Promise<T> {
  return "$transaction" in db ? (db as Db).$transaction(fn) : fn(db);
}

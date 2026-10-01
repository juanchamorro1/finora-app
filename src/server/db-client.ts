import type { SqlDriverAdapterFactory } from "@prisma/driver-adapter-utils";
import { PrismaClient } from "@/generated/prisma/client";

export type Db = PrismaClient;

/** Cliente de transacción interactiva (mismo API de modelos que PrismaClient). */
export type DbTx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * Elige el cliente libSQL según la URL, cargándolo solo cuando se conecta:
 * - `file:…`   → cliente nativo (base local en el PC).
 * - `libsql://` → cliente web (HTTP, sin binarios nativos). Es el que usa Vercel,
 *   donde el binario nativo de libSQL no se incluye en el despliegue.
 */
function libsqlAdapter(url: string, authToken?: string): SqlDriverAdapterFactory {
  const config = { url, authToken: authToken || undefined };
  const load = async () =>
    url.startsWith("file:")
      ? new (await import("@prisma/adapter-libsql")).PrismaLibSql(config)
      : new (await import("@prisma/adapter-libsql/web")).PrismaLibSql(config);
  return {
    provider: "sqlite",
    adapterName: "@prisma/adapter-libsql",
    connect: async () => (await load()).connect(),
  };
}

/** Crea un cliente: archivo local (`file:./data/finora.db`) o Turso (`libsql://…` + token). */
export function createDb(url: string, authToken?: string): PrismaClient {
  return new PrismaClient({ adapter: libsqlAdapter(url, authToken) });
}

/**
 * Ejecuta `fn` dentro de una transacción. Si `db` ya es una transacción,
 * reutiliza la misma (Prisma no admite transacciones interactivas anidadas).
 */
export async function withTx<T>(db: Db | DbTx, fn: (tx: DbTx) => Promise<T>): Promise<T> {
  return "$transaction" in db ? (db as Db).$transaction(fn) : fn(db);
}

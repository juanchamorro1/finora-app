import { createDb, type Db } from "./db-client";
import { readEnv } from "./env";

export { withTx, type Db, type DbTx } from "./db-client";

const globalForDb = globalThis as unknown as { finoraDb?: Db };

function getUrl(): string {
  const url = readEnv("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL no está definida (revisa el archivo .env)");
  return url;
}

/** Instancia única de la app (sobrevive al hot-reload en desarrollo). */
export const db: Db = globalForDb.finoraDb ?? createDb(getUrl(), readEnv("DATABASE_AUTH_TOKEN"));

if (process.env.NODE_ENV !== "production") globalForDb.finoraDb = db;

import { createDb, type Db } from "./db-client";
import { readEnv } from "./env";

export { withTx, type Db, type DbTx } from "./db-client";

const globalForDb = globalThis as unknown as { finoraDb?: Db };

function getUrl(): string {
  const url = readEnv("DATABASE_URL");
  if (!url) throw new Error("DATABASE_URL no está definida (revisa el archivo .env)");
  return url;
}

/** Crea el cliente la primera vez que se usa (sobrevive al hot-reload en desarrollo). */
function getDb(): Db {
  globalForDb.finoraDb ??= createDb(getUrl(), readEnv("DATABASE_AUTH_TOKEN"));
  return globalForDb.finoraDb;
}

/**
 * Instancia única de la app. Se conecta al primer uso, no al importar: así
 * `next build` funciona aunque el entorno no tenga DATABASE_URL (ej. un Preview
 * de Vercel); el error aparece solo si de verdad se consulta la base.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb(), prop);
  },
});

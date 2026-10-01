import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, type Db } from "../db-client";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../prisma/migrations");

/** Crea una BD SQLite temporal con todas las migraciones reales aplicadas. */
export async function createTestDb(): Promise<{ db: Db; raw: Database.Database; cleanup: () => Promise<void> }> {
  const dir = mkdtempSync(path.join(tmpdir(), "finora-test-"));
  const file = path.join(dir, "test.db");
  const raw = new Database(file);
  raw.pragma("foreign_keys = ON");
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  for (const name of migrations) {
    raw.exec(readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"));
  }
  const db = createDb(`file:${file}`);
  return {
    db,
    raw,
    cleanup: async () => {
      await db.$disconnect();
      raw.close();
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // En Windows libSQL puede retener el archivo un momento; es un temporal del sistema.
      }
    },
  };
}

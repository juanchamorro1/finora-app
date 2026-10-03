#!/usr/bin/env node
/**
 * Prepara la base en la nube (Turso) y copia tus datos locales.
 *
 * Requiere un archivo .env.turso (no se sube a git) con:
 *   TURSO_DATABASE_URL=libsql://<tu-base>.turso.io
 *   TURSO_AUTH_TOKEN=<token>
 *
 *   npm run turso:backup           copia de seguridad CIFRADA de la nube en data/
 *   npm run turso:migrate          aplica las migraciones pendientes
 *   npm run turso:import           copia data/finora.db a Turso (solo si Turso está vacía)
 */
import { createClient } from "@libsql/client";
import Database from "better-sqlite3";
import { config } from "dotenv";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { encryptBackup } from "./backup-crypto.mjs";
import { askHidden } from "./prompt.mjs";

config({ path: ".env.turso", quiet: true });
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
// "file:" se permite solo para probar el script localmente.
if (!url || (url.startsWith("libsql://") ? !authToken : !url.startsWith("file:"))) {
  console.error("Falta .env.turso con TURSO_DATABASE_URL (libsql://…) y TURSO_AUTH_TOKEN.");
  process.exit(1);
}
const remote = createClient({ url, authToken, intMode: "bigint" });
const command = process.argv[2];

async function migrate() {
  await remote.execute(
    `CREATE TABLE IF NOT EXISTS "_finora_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL)`,
  );
  const applied = new Set((await remote.execute(`SELECT name FROM "_finora_migrations"`)).rows.map((r) => r.name));
  const dir = "prisma/migrations";
  const pending = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !applied.has(d.name))
    .map((d) => d.name)
    .sort();
  for (const name of pending) {
    const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
    await remote.executeMultiple(sql);
    await remote.execute({ sql: `INSERT INTO "_finora_migrations" VALUES (?, ?)`, args: [name, new Date().toISOString()] });
    console.log(`✓ migración aplicada: ${name}`);
  }
  if (pending.length === 0) console.log("La base en la nube ya está al día.");
}

// Orden que respeta las claves foráneas.
const TABLES = ["User", "Account", "Category", "Transaction", "Budget", "SavingsGoal", "GoalContribution", "ExchangeRate", "Setting"];

async function importLocal(file = "data/finora.db") {
  if (!existsSync(file)) throw new Error(`No existe ${file}`);
  const existing = Number((await remote.execute(`SELECT count(*) AS n FROM "Account"`)).rows[0].n);
  const settings = Number((await remote.execute(`SELECT count(*) AS n FROM "Setting"`)).rows[0].n);
  if (existing > 0 || settings > 0) {
    throw new Error("La base en la nube ya tiene datos; no se sobrescribe nada.");
  }
  const local = new Database(file, { readonly: true });
  const statements = [];
  const counts = {};
  for (const table of TABLES) {
    const rows = local.prepare(`SELECT * FROM "${table}"`).all();
    counts[table] = rows.length;
    for (const row of rows) {
      const cols = Object.keys(row);
      statements.push({
        sql: `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
        args: cols.map((c) => row[c]),
      });
    }
  }
  local.close();
  // Una sola transacción: o se copia todo, o nada.
  await remote.batch(statements, "write");
  console.log("✓ datos copiados:", counts);
}

/**
 * Copia de seguridad completa de la nube, CIFRADA con una frase que eliges
 * (data/respaldo-nube-<fecha>.cifrado.json). Para leerla: npm run respaldo:descifrar.
 */
async function backup() {
  const passphrase = await askHidden("Frase para cifrar el respaldo (mínimo 12 caracteres): ");
  if (passphrase.length < 12) throw new Error("La frase debe tener al menos 12 caracteres.");
  if ((await askHidden("Repítela: ")) !== passphrase) throw new Error("Las frases no coinciden.");
  const tables = (await remote.execute(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)).rows.map((r) => r.name);
  const dump = { createdAt: new Date().toISOString(), tables: {} };
  for (const table of tables) {
    const { rows, columns } = await remote.execute(`SELECT * FROM "${table}"`);
    dump.tables[table] = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, typeof r[i] === "bigint" ? r[i].toString() : r[i]])));
  }
  const file = `data/respaldo-nube-${dump.createdAt.replace(/[:.]/g, "-")}.cifrado.json`;
  writeFileSync(file, encryptBackup(JSON.stringify(dump), passphrase));
  console.log(`✓ respaldo CIFRADO guardado en ${file}. Guarda la frase: sin ella no se puede recuperar.`);
  console.log("  contenido:", Object.fromEntries(Object.entries(dump.tables).map(([t, r]) => [t, r.length])));
}

try {
  if (command === "backup") await backup();
  else if (command === "migrate") await migrate();
  else if (command === "import") await importLocal(process.argv[3]);
  else {
    console.error("Uso: node scripts/turso.mjs <backup|migrate|import>");
    process.exit(1);
  }
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
} finally {
  remote.close();
}

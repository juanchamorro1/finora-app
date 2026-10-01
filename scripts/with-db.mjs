#!/usr/bin/env node
/**
 * Ejecuta un comando contra una base de datos separada de la real.
 *
 *   node scripts/with-db.mjs demo next dev --port 3001
 *
 * Usa data/<nombre>.db, aplica las migraciones y luego ejecuta el comando con
 * DATABASE_URL apuntando a esa base. La base real (data/finora.db) no se toca.
 */
import { spawnSync } from "node:child_process";

const [name, ...command] = process.argv.slice(2);
if (!name || !/^[a-z0-9-]+$/.test(name) || name === "finora" || command.length === 0) {
  console.error("Uso: node scripts/with-db.mjs <nombre-base (no 'finora')> <comando...>");
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: `file:./data/${name}.db`, FINORA_DB_NAME: name };
const run = (cmd, args) => {
  // Los argumentos vienen de package.json (no del usuario); se unen para el shell de Windows.
  const result = spawnSync([cmd, ...args].join(" "), { stdio: "inherit", env, shell: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

console.log(`[finora] usando base separada: data/${name}.db`);
run("npx", ["prisma", "migrate", "deploy"]);
run("npx", command);

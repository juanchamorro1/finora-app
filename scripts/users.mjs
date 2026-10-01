#!/usr/bin/env node
/**
 * Gestión de usuarios de Finora. Las contraseñas se escriben ocultas y nunca se guardan en texto.
 *
 *   npm run users -- list                 lista los usuarios
 *   npm run users -- add                  crea un usuario (pide usuario, nombre y contraseña)
 *   npm run users -- password <usuario>   cambia la contraseña
 *   npm run users -- secret               genera un FINORA_SESSION_SECRET nuevo
 *
 * Por defecto usa la base local (.env → DATABASE_URL). Agrega --nube para usar Turso (.env.turso).
 */
import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { randomBytes, randomUUID, scrypt } from "node:crypto";
import { stdin, stdout } from "node:process";

const args = process.argv.slice(2);
const cloud = args.includes("--nube");
const [command, target] = args.filter((a) => a !== "--nube");

if (command === "secret") {
  console.log("FINORA_SESSION_SECRET=" + randomBytes(32).toString("base64url"));
  process.exit(0);
}

let url, authToken;
if (cloud) {
  config({ path: ".env.turso", quiet: true });
  url = process.env.TURSO_DATABASE_URL;
  authToken = process.env.TURSO_AUTH_TOKEN;
} else {
  config({ path: ".env", quiet: true });
  url = process.env.DATABASE_URL;
}
if (!url) {
  console.error(cloud ? "Falta .env.turso con TURSO_DATABASE_URL y TURSO_AUTH_TOKEN." : "Falta DATABASE_URL en .env.");
  process.exit(1);
}
const db = createClient({ url, authToken });
console.log(`[finora] base: ${cloud ? "nube (Turso)" : url}`);

// Lector único de stdin: en una terminal usa modo "raw" para poder ocultar la
// contraseña; si la entrada viene de otro programa, simplemente lee líneas.
const isTTY = Boolean(stdin.isTTY);
let buffer = "";
let pending = null; // { resolve, hidden, value }
let skipLF = false; // tras un "\r", ignora el "\n" de un "\r\n"
stdin.setEncoding("utf8");
if (isTTY) stdin.setRawMode(true);
stdin.on("data", (chunk) => {
  buffer += chunk;
  drain();
});

function drain() {
  while (pending && buffer.length) {
    const ch = buffer[0];
    buffer = buffer.slice(1);
    if (ch === "\u0003") process.exit(1);
    if (ch === "\n" && skipLF) {
      skipLF = false;
      continue;
    }
    skipLF = ch === "\r";
    if (ch === "\r" || ch === "\n") {
      const { resolve, value } = pending;
      pending = null;
      if (isTTY) stdout.write("\n");
      stdin.pause();
      resolve(value);
      return;
    }
    if (ch === "\u007f" || ch === "\b") {
      if (pending.value && isTTY && !pending.hidden) stdout.write("\b \b");
      pending.value = pending.value.slice(0, -1);
    } else {
      pending.value += ch;
      if (isTTY && !pending.hidden) stdout.write(ch);
    }
  }
}

function ask(question, hidden) {
  return new Promise((resolve) => {
    stdout.write(question);
    pending = { resolve, hidden, value: "" };
    stdin.resume();
    drain();
  });
}

const askVisible = async (question) => (await ask(question, false)).trim();
const askHidden = (question) => ask(question, true);

async function askPassword() {
  const password = await askHidden("Contraseña (mínimo 10 caracteres): ");
  if (password.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres.");
  if ((await askHidden("Repítela: ")) !== password) throw new Error("Las contraseñas no coinciden.");
  const salt = randomBytes(16);
  const hash = await new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, 64, (err, key) => (err ? reject(err) : resolve(key))),
  );
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

const now = () => new Date().toISOString();
const USERNAME = /^[a-z0-9._-]{3,30}$/;

try {
  if (command === "list") {
    const { rows } = await db.execute(`SELECT username, name, passwordHash LIKE 'scrypt:%' AS ready FROM "User" ORDER BY createdAt`);
    if (rows.length === 0) console.log("No hay usuarios.");
    for (const r of rows) console.log(`- ${r.username} (${r.name})${r.ready ? "" : "  ← sin contraseña"}`);
  } else if (command === "add") {
    const username = (await askVisible("Usuario para iniciar sesión (ej. mama): ")).toLowerCase();
    if (!USERNAME.test(username)) throw new Error("Usa 3-30 caracteres: letras minúsculas, números, punto, guion.");
    const exists = await db.execute({ sql: `SELECT 1 FROM "User" WHERE username = ?`, args: [username] });
    if (exists.rows.length) throw new Error(`Ya existe el usuario "${username}".`);
    const name = await askVisible("Nombre para mostrar (ej. Mamá): ");
    if (!name) throw new Error("El nombre es obligatorio.");
    const passwordHash = await askPassword();
    await db.execute({
      sql: `INSERT INTO "User" (id, username, name, passwordHash, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), username, name, passwordHash, now(), now()],
    });
    console.log(`✓ Usuario "${username}" creado. Al entrar verá la configuración inicial con sus propias finanzas.`);
  } else if (command === "password") {
    if (!target) throw new Error("Indica el usuario: npm run users -- password <usuario>");
    const user = await db.execute({ sql: `SELECT id FROM "User" WHERE username = ?`, args: [target.toLowerCase()] });
    if (!user.rows.length) throw new Error(`No existe el usuario "${target}".`);
    const passwordHash = await askPassword();
    await db.execute({ sql: `UPDATE "User" SET passwordHash = ?, updatedAt = ? WHERE id = ?`, args: [passwordHash, now(), user.rows[0].id] });
    console.log(`✓ Contraseña de "${target}" actualizada.`);
  } else {
    console.log("Uso: npm run users -- <list | add | password <usuario> | secret> [--nube]");
    process.exit(1);
  }
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
} finally {
  db.close();
}

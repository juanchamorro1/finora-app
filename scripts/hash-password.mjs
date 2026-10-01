#!/usr/bin/env node
/**
 * Genera el hash de tu contraseña para FINORA_PASSWORD_HASH.
 * La contraseña se escribe oculta y nunca se guarda en ningún archivo.
 *
 *   npm run auth:hash
 */
import { randomBytes, scrypt } from "node:crypto";
import { stdin, stdout } from "node:process";

function ask(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    let value = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") {
        process.exit(1);
      } else if (ch === "\u007f" || ch === "\b") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await ask("Contraseña nueva: ");
if (password.length < 10) {
  console.error("Usa al menos 10 caracteres.");
  process.exit(1);
}
if ((await ask("Repítela: ")) !== password) {
  console.error("No coinciden.");
  process.exit(1);
}
const salt = randomBytes(16);
scrypt(password.normalize("NFKC"), salt, 64, (err, hash) => {
  if (err) throw err;
  console.log("\nFINORA_PASSWORD_HASH=" + `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`);
  console.log("FINORA_SESSION_SECRET=" + randomBytes(32).toString("base64url"));
  console.log("\nCopia estas dos líneas en las variables de entorno (no las compartas).");
});

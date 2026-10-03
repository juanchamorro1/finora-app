/**
 * Preguntas en la terminal, con entrada oculta para contraseñas.
 * Funciona en una terminal (modo "raw") y con entrada redirigida (líneas).
 * No toca stdin hasta la primera pregunta, y lo libera al responder.
 */
import { stdin, stdout } from "node:process";

const isTTY = Boolean(stdin.isTTY);
let buffer = "";
let pending = null; // { resolve, hidden, value }
let skipLF = false; // tras un "\r", ignora el "\n" de un "\r\n"
let listening = false;

function onData(chunk) {
  buffer += chunk;
  drain();
}

function drain() {
  while (pending && buffer.length) {
    const ch = buffer[0];
    buffer = buffer.slice(1);
    if (ch === "\u0003") {
      if (isTTY) stdin.setRawMode(false);
      process.exit(1);
    }
    if (ch === "\n" && skipLF) {
      skipLF = false;
      continue;
    }
    skipLF = ch === "\r";
    if (ch === "\r" || ch === "\n") {
      const { resolve, value } = pending;
      pending = null;
      if (isTTY) {
        stdout.write("\n");
        stdin.setRawMode(false);
      }
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

export function ask(question, hidden) {
  if (!listening) {
    stdin.setEncoding("utf8");
    stdin.on("data", onData);
    listening = true;
  }
  return new Promise((resolve) => {
    stdout.write(question);
    pending = { resolve, hidden, value: "" };
    if (isTTY) stdin.setRawMode(true);
    stdin.resume();
    drain();
  });
}

export const askVisible = async (question) => (await ask(question, false)).trim();
export const askHidden = (question) => ask(question, true);

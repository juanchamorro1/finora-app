/**
 * Cifrado de copias de seguridad: AES-256-GCM con una clave derivada de tu
 * frase con scrypt. Sin la frase, el archivo no se puede leer.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const FORMAT = "finora-respaldo-cifrado-v1";

function deriveKey(passphrase, salt) {
  return scryptSync(passphrase.normalize("NFKC"), salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

/** Cifra un texto y devuelve el contenido del archivo (JSON). */
export function encryptBackup(plaintext, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(passphrase, salt), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return JSON.stringify({
    formato: FORMAT,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    datos: data.toString("base64"),
  });
}

/** Descifra el contenido de un archivo de respaldo. Lanza si la frase es incorrecta. */
export function decryptBackup(fileContent, passphrase) {
  const box = JSON.parse(fileContent);
  if (box.formato !== FORMAT) throw new Error("El archivo no es un respaldo cifrado de Finora.");
  const decipher = createDecipheriv("aes-256-gcm", deriveKey(passphrase, Buffer.from(box.salt, "base64")), Buffer.from(box.iv, "base64"));
  decipher.setAuthTag(Buffer.from(box.tag, "base64"));
  try {
    return Buffer.concat([decipher.update(Buffer.from(box.datos, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Frase incorrecta o archivo dañado.");
  }
}

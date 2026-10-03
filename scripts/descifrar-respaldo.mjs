#!/usr/bin/env node
/**
 * Descifra un respaldo creado con `npm run turso:backup`.
 *
 *   npm run respaldo:descifrar -- data/respaldo-nube-....cifrado.json
 *
 * Muestra un resumen. Con --guardar escribe el contenido descifrado junto al
 * archivo (bórralo cuando termines: queda SIN cifrar).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { decryptBackup } from "./backup-crypto.mjs";
import { askHidden } from "./prompt.mjs";

const args = process.argv.slice(2);
const save = args.includes("--guardar");
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("Uso: npm run respaldo:descifrar -- <archivo.cifrado.json> [--guardar]");
  process.exit(1);
}

try {
  const json = decryptBackup(readFileSync(file, "utf8"), await askHidden("Frase del respaldo: "));
  const dump = JSON.parse(json);
  console.log(`✓ Respaldo del ${dump.createdAt}:`, Object.fromEntries(Object.entries(dump.tables).map(([t, r]) => [t, r.length])));
  if (save) {
    const out = file.replace(/\.cifrado\.json$/, "") + ".descifrado.json";
    writeFileSync(out, JSON.stringify(dump, null, 2));
    console.log(`⚠ Guardado SIN cifrar en ${out}. Bórralo cuando termines.`);
  }
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
}

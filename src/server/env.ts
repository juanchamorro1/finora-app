/**
 * Lee una variable de entorno tolerando errores comunes al pegarla en un panel
 * (Vercel): espacios, comillas alrededor o el nombre de la variable delante
 * ("TURSO_AUTH_TOKEN=eyJ…"). Si corrige algo, lo avisa en los logs.
 */
const warned = new Set<string>();

export function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  let value = raw.trim();
  const prefixed = /^[A-Z][A-Z0-9_]*=(.*)$/s.exec(value);
  if (prefixed) value = prefixed[1].trim();
  const quoted = /^(["'])(.*)\1$/s.exec(value);
  if (quoted) value = quoted[2].trim();
  if (value !== raw.trim() && !warned.has(name)) {
    warned.add(name);
    console.warn(`[finora] La variable ${name} tenía un formato incorrecto (nombre delante o comillas); se corrigió automáticamente. Revísala en el panel.`);
  }
  return value || undefined;
}

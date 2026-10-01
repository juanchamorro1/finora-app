/** Compara nombres sin distinguir mayúsculas ni tildes ("Educacion" = "educación"). */
export function sameName(a: string, b: string): boolean {
  return a.trim().localeCompare(b.trim(), "es", { sensitivity: "base" }) === 0;
}

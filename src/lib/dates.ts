/**
 * Fechas en la zona horaria de Colombia (America/Bogota, UTC-5 fijo, sin horario de verano).
 * En BD se guardan instantes UTC; todos los rangos (día, mes, año) se calculan aquí
 * como intervalos semiabiertos [from, to).
 */

export const TIME_ZONE = "America/Bogota";
const OFFSET_MS = -5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DateRange {
  from: Date;
  to: Date;
}

/** Componentes de calendario locales de Bogotá para un instante. */
export function localParts(date: Date) {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** Instante UTC correspondiente a la medianoche local de Bogotá (month: 1-12, admite desbordes). */
export function localMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - OFFSET_MS);
}

export function startOfDay(date: Date): Date {
  const p = localParts(date);
  return localMidnight(p.year, p.month, p.day);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function monthRange(year: number, month: number): DateRange {
  return { from: localMidnight(year, month, 1), to: localMidnight(year, month + 1, 1) };
}

export function currentMonthRange(now: Date = new Date()): DateRange {
  const p = localParts(now);
  return monthRange(p.year, p.month);
}

/** "2026-09-30" para el día local del instante. */
export function toDateKey(date: Date): string {
  const p = localParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** "2026-09" para el mes local del instante. */
export function toMonthKey(date: Date): string {
  return toDateKey(date).slice(0, 7);
}

export function isValidDateKey(key: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/**
 * Convierte "YYYY-MM-DD" a un instante. Si es hoy, usa la hora actual (para ordenar
 * bien los movimientos del día); en otro caso, el mediodía local.
 */
export function dateKeyToInstant(key: string, now: Date = new Date()): Date {
  if (!isValidDateKey(key)) throw new Error(`Fecha inválida: ${key}`);
  if (key === toDateKey(now)) return now;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(localMidnight(y, m, d).getTime() + 12 * 60 * 60 * 1000);
}

/** Inicio del día local para una clave "YYYY-MM-DD". */
export function dateKeyToStartOfDay(key: string): Date {
  if (!isValidDateKey(key)) throw new Error(`Fecha inválida: ${key}`);
  const [y, m, d] = key.split("-").map(Number);
  return localMidnight(y, m, d);
}

/** Número de días locales (≥ 1) cubiertos por un rango. */
export function daysInRange(range: DateRange): number {
  return Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS));
}

/** Claves de mes ("YYYY-MM") que intersectan el rango, en orden. */
export function monthKeysInRange(range: DateRange): string[] {
  const keys: string[] = [];
  const start = localParts(range.from);
  let y = start.year;
  let m = start.month;
  while (localMidnight(y, m, 1) < range.to) {
    keys.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const shortDateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
});
const monthFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: TIME_ZONE,
  month: "long",
  year: "numeric",
});
const shortMonthFormatter = new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", month: "short" });

export function formatDate(date: Date): string {
  return dateFormatter.format(date).replace(".", "");
}

export function formatShortDate(date: Date): string {
  return shortDateFormatter.format(date).replace(".", "");
}

export function formatMonth(date: Date): string {
  return monthFormatter.format(date);
}

/** "2026-09" → "sept" (etiqueta corta para gráficos). */
export function formatMonthKeyShort(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return shortMonthFormatter.format(new Date(Date.UTC(y, m - 1, 15))).replace(".", "");
}

/** Etiqueta relativa para listas: "Hoy", "Ayer" o la fecha. */
export function formatRelativeDay(date: Date, now: Date = new Date()): string {
  const key = toDateKey(date);
  if (key === toDateKey(now)) return "Hoy";
  if (key === toDateKey(addDays(now, -1))) return "Ayer";
  return localParts(date).year === localParts(now).year ? formatShortDate(date) : formatDate(date);
}

import {
  currentMonthRange,
  dateKeyToStartOfDay,
  addDays,
  isValidDateKey,
  localMidnight,
  localParts,
  monthRange,
  type DateRange,
} from "./dates";

export const PERIOD_PRESETS = {
  "this-month": "Este mes",
  "last-month": "Mes anterior",
  "last-3-months": "Últimos 3 meses",
  "last-6-months": "Últimos 6 meses",
  "this-year": "Este año",
  custom: "Rango personalizado",
} as const;

export type PeriodPreset = keyof typeof PERIOD_PRESETS;

export interface Period extends DateRange {
  preset: PeriodPreset;
  label: string;
}

export function isPeriodPreset(value: unknown): value is PeriodPreset {
  return typeof value === "string" && value in PERIOD_PRESETS;
}

/**
 * Resuelve un periodo. Los rangos de "últimos N meses" incluyen el mes actual
 * completo (ej. últimos 3 meses en septiembre = julio, agosto, septiembre).
 * Para "custom", `fromKey` y `toKey` son días inclusivos "YYYY-MM-DD".
 */
export function resolvePeriod(
  preset: PeriodPreset,
  opts: { fromKey?: string; toKey?: string; now?: Date } = {},
): Period {
  const now = opts.now ?? new Date();
  const { year, month } = localParts(now);
  const label = PERIOD_PRESETS[preset];
  switch (preset) {
    case "this-month":
      return { preset, label, ...currentMonthRange(now) };
    case "last-month":
      return { preset, label, ...monthRange(year, month - 1) };
    case "last-3-months":
      return { preset, label, from: localMidnight(year, month - 2, 1), to: localMidnight(year, month + 1, 1) };
    case "last-6-months":
      return { preset, label, from: localMidnight(year, month - 5, 1), to: localMidnight(year, month + 1, 1) };
    case "this-year":
      return { preset, label, from: localMidnight(year, 1, 1), to: localMidnight(year + 1, 1, 1) };
    case "custom": {
      if (!opts.fromKey || !opts.toKey || !isValidDateKey(opts.fromKey) || !isValidDateKey(opts.toKey)) {
        return { preset: "this-month", label: PERIOD_PRESETS["this-month"], ...currentMonthRange(now) };
      }
      let from = dateKeyToStartOfDay(opts.fromKey);
      let to = addDays(dateKeyToStartOfDay(opts.toKey), 1);
      if (to <= from) [from, to] = [addDays(to, -1), addDays(from, 1)];
      return { preset, label, from, to };
    }
  }
}

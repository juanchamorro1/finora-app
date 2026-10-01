import { isPeriodPreset, resolvePeriod, type Period } from "@/lib/periods";

type SearchParams = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lee ?periodo=…&desde=…&hasta=… (por defecto, este mes). */
export function parsePeriodParams(params: SearchParams, now: Date = new Date()): Period {
  const preset = one(params.periodo);
  return resolvePeriod(isPeriodPreset(preset) ? preset : "this-month", {
    fromKey: one(params.desde),
    toKey: one(params.hasta),
    now,
  });
}

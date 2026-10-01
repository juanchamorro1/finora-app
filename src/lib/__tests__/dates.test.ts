import { describe, expect, it } from "vitest";
import { currentMonthRange, dateKeyToInstant, monthKeysInRange, toDateKey } from "../dates";
import { resolvePeriod } from "../periods";

describe("fechas en America/Bogota", () => {
  it("un gasto a las 9 p. m. del 30 de septiembre sigue siendo de septiembre", () => {
    const lateNight = new Date("2026-10-01T02:00:00Z"); // 30 sept 21:00 en Bogotá
    expect(toDateKey(lateNight)).toBe("2026-09-30");
    const { from, to } = currentMonthRange(lateNight);
    expect(from.toISOString()).toBe("2026-09-01T05:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(lateNight >= from && lateNight < to).toBe(true);
  });

  it("usa mediodía local para fechas pasadas y la hora actual para hoy", () => {
    const now = new Date("2026-09-30T20:00:00Z");
    expect(dateKeyToInstant("2026-09-15", now).toISOString()).toBe("2026-09-15T17:00:00.000Z");
    expect(dateKeyToInstant("2026-09-30", now)).toBe(now);
    expect(() => dateKeyToInstant("2026-02-30", now)).toThrow();
  });

  it("resuelve periodos predefinidos", () => {
    const now = new Date("2026-01-15T15:00:00Z");
    const lastMonth = resolvePeriod("last-month", { now });
    expect(toDateKey(lastMonth.from)).toBe("2025-12-01");
    expect(monthKeysInRange(resolvePeriod("last-3-months", { now }))).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(monthKeysInRange(resolvePeriod("this-year", { now }))).toHaveLength(12);
    const custom = resolvePeriod("custom", { fromKey: "2026-01-01", toKey: "2026-01-10", now });
    expect(toDateKey(custom.from)).toBe("2026-01-01");
    expect(toDateKey(new Date(custom.to.getTime() - 1))).toBe("2026-01-10");
  });
});

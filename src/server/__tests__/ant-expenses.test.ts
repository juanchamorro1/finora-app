import { describe, expect, it } from "vitest";
import { monthRange } from "@/lib/dates";
import type { Flow } from "../services/analytics";
import { analyzeAntExpenses } from "../services/ant-expenses";

const comida = { id: "c1", name: "Comida", color: "#000", icon: "utensils" };
const hormiga = { id: "c2", name: "Gastos hormiga", color: "#000", icon: "coffee" };
const tech = { id: "c3", name: "Tecnología", color: "#000", icon: "laptop" };
let n = 0;
const flow = (amount: bigint, description: string, category = comida, day = 10, type: Flow["type"] = "EXPENSE"): Flow => ({
  id: `f${n++}`,
  type,
  amount,
  date: new Date(`2026-09-${String(day).padStart(2, "0")}T17:00:00Z`),
  description,
  accountId: "a",
  category,
  savings: false,
});

describe("gastos hormiga", () => {
  const range = monthRange(2026, 9);
  const flows: Flow[] = [
    flow(2_000n, "Tinto", comida, 1),
    flow(3_000n, "tinto ", comida, 3),
    flow(2_500n, "Tintó", comida, 5),
    flow(5_000n, "Empanada", comida, 6),
    flow(4_000n, "Empanada", comida, 8),
    flow(6_000n, "Gaseosa", hormiga, 9),
    flow(15_000n, "Snacks del mes", hormiga, 12), // supera el umbral pero el usuario lo marcó como hormiga
    flow(1_200_000n, "Portátil", tech, 15),
    flow(9_000n, "Bono", comida, 15, "INCOME"),
  ];

  it("cuenta gastos pequeños y los marcados explícitamente, sin incluir ingresos", () => {
    const a = analyzeAntExpenses(flows, 10_000n, range, new Date("2026-10-15T00:00:00Z"));
    expect(a.count).toBe(7);
    expect(a.total).toBe(37_500n);
    expect(a.shareOfExpenses).toBe(3);
    expect(a.byCategory.map((c) => [c.category.name, c.count])).toEqual([
      ["Gastos hormiga", 2],
      ["Comida", 5],
    ]);
  });

  it("agrupa patrones por descripción normalizada (mayúsculas, tildes, espacios)", () => {
    const a = analyzeAntExpenses(flows, 10_000n, range, new Date("2026-10-15T00:00:00Z"));
    expect(a.patterns).toHaveLength(1);
    expect(a.patterns[0]).toMatchObject({ label: "Tinto", count: 3, total: 7_500n, average: 2_500n });
  });

  it("proyecta al ritmo de los días transcurridos y respeta el umbral configurado", () => {
    const a = analyzeAntExpenses(flows, 10_000n, range, new Date("2026-09-15T17:00:00Z"));
    // 37.500 en 15 días → 2.500/día
    expect(a.monthlyEstimate).toBe(75_000n);
    expect(a.yearlyEstimate).toBe(912_500n);
    const strict = analyzeAntExpenses(flows, 2_500n, range);
    expect(strict.count).toBe(4); // 2.000, 2.500 y los dos marcados en "Gastos hormiga"
  });

  it("sin gastos pequeños devuelve ceros", () => {
    const a = analyzeAntExpenses([flow(500_000n, "Arriendo", tech)], 10_000n, range);
    expect(a).toMatchObject({ count: 0, total: 0n, average: 0n, patterns: [] });
  });
});

import { describe, expect, it } from "vitest";
import {
  convertToBase,
  divRound,
  formatAmountInput,
  formatMoney,
  formatTypingAmount,
  parseMoney,
  parseRate,
  percentOf,
} from "../money";

describe("formatMoney", () => {
  it("formatea COP con puntos de miles y sin decimales", () => {
    expect(formatMoney(12_000n)).toBe("$12.000");
    expect(formatMoney(157_700n)).toBe("$157.700");
    expect(formatMoney(1_250_000n)).toBe("$1.250.000");
    expect(formatMoney(0n)).toBe("$0");
    expect(formatMoney(-8_000n)).toBe("-$8.000");
    expect(formatMoney(8_000n, "COP", { signDisplay: "always" })).toBe("+$8.000");
  });

  it("formatea monedas con decimales", () => {
    expect(formatMoney(125_050n, "USD")).toBe("US$1.250,50");
    expect(formatMoney(5n, "USDT")).toBe("USDT 0,05");
  });

  it("maneja montos enormes sin perder precisión", () => {
    expect(formatMoney(9_007_199_254_740_993n)).toBe("$9.007.199.254.740.993");
  });
});

describe("parseMoney", () => {
  it("interpreta formato colombiano", () => {
    expect(parseMoney("8.000")).toBe(8_000n);
    expect(parseMoney("$1.250.000")).toBe(1_250_000n);
    expect(parseMoney("8000")).toBe(8_000n);
    expect(parseMoney(" 12000 ")).toBe(12_000n);
    expect(parseMoney("8.000,00")).toBe(8_000n);
  });

  it("interpreta decimales en monedas que los admiten", () => {
    expect(parseMoney("12,5", "USD")).toBe(1_250n);
    expect(parseMoney("12.50", "USD")).toBe(1_250n);
    expect(parseMoney("1.250,75", "USD")).toBe(125_075n);
    expect(parseMoney("1.250", "USD")).toBe(125_000n);
  });

  it("rechaza entradas inválidas", () => {
    expect(() => parseMoney("abc")).toThrow();
    expect(() => parseMoney("12,5")).toThrow(/decimales/);
    expect(() => parseMoney("1.25.0")).toThrow();
    expect(() => parseMoney("12,345", "USD")).toThrow();
  });
});

describe("conversión y porcentajes", () => {
  it("convierte USD a COP con redondeo", () => {
    const rate = parseRate("4.012,35"); // 4012.35 COP por USD
    expect(convertToBase(100n, "USD", rate)).toBe(4_012n); // US$1,00
    expect(convertToBase(15_050n, "USD", rate)).toBe(603_859n); // US$150,50 → 603.858,675
    expect(convertToBase(5_000n, "COP", rate)).toBe(5_000n);
  });

  it("redondea a la mitad alejándose de cero", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
  });

  it("calcula porcentajes", () => {
    expect(percentOf(75_000n, 100_000n)).toBe(75);
    expect(percentOf(1n, 3n)).toBe(33.3);
    expect(percentOf(5n, 0n)).toBe(0);
  });
});

describe("entrada de montos", () => {
  it("formatea mientras se escribe", () => {
    expect(formatTypingAmount("1250000")).toBe("1.250.000");
    expect(formatTypingAmount("$8.000")).toBe("8.000");
    expect(formatTypingAmount("12,5", "COP")).toBe("12");
    expect(formatTypingAmount("1250,75", "USD")).toBe("1.250,75");
    expect(formatTypingAmount("007")).toBe("7");
    expect(formatAmountInput(8_000n)).toBe("8.000");
    expect(formatAmountInput(1_250n, "USD")).toBe("12,50");
  });
});

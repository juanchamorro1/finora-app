import { BASE_CURRENCY, currencyInfo, type CurrencyCode } from "./currency";

/**
 * Utilidades de dinero. Nunca se usa aritmética de punto flotante sobre montos:
 * todo es BigInt en unidades mínimas.
 */

const RATE_SCALE = 1_000_000n;

function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Formatea un monto en unidades mínimas al estilo colombiano:
 * 12000n COP → "$12.000", 125050n USD → "US$1.250,50".
 */
export function formatMoney(
  amount: bigint,
  currency: string = BASE_CURRENCY,
  options: { signDisplay?: "auto" | "always" } = {},
): string {
  const { decimals, symbol } = currencyInfo(currency);
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const scale = pow10(decimals);
  const integerPart = groupThousands((abs / scale).toString());
  let body = integerPart;
  if (decimals > 0) {
    const fraction = (abs % scale).toString().padStart(decimals, "0");
    body += "," + fraction;
  }
  const sign = negative ? "-" : options.signDisplay === "always" && abs > 0n ? "+" : "";
  return `${sign}${symbol}${body}`;
}

/** Versión compacta para ejes de gráficos: 1.250.000 → "$1,3 M". */
export function formatMoneyCompact(amount: bigint, currency: string = BASE_CURRENCY): string {
  const { decimals, symbol } = currencyInfo(currency);
  const major = Number(amount) / 10 ** decimals;
  const abs = Math.abs(major);
  const fmt = (n: number, suffix: string) =>
    `${major < 0 ? "-" : ""}${symbol}${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })}${suffix}`;
  if (abs >= 1_000_000_000) return fmt(abs / 1_000_000_000, " mil M");
  if (abs >= 1_000_000) return fmt(abs / 1_000_000, " M");
  if (abs >= 1_000) return fmt(abs / 1_000, " mil");
  return fmt(abs, "");
}

export class MoneyParseError extends Error {}

/**
 * Convierte texto introducido por el usuario a unidades mínimas.
 * Acepta formato colombiano ("8.000", "1.250.000", "12,50") y también
 * "12.50" como decimal cuando la moneda admite decimales.
 */
export function parseMoney(input: string, currency: string = BASE_CURRENCY): bigint {
  const { decimals } = currencyInfo(currency);
  let text = input.trim().replace(/[\s$€]|US|USDT|COP/gi, "");
  let negative = false;
  if (text.startsWith("-")) {
    negative = true;
    text = text.slice(1);
  }
  if (!/^[\d.,]+$/.test(text)) throw new MoneyParseError("Monto inválido");

  let integerText = text;
  let fractionText = "";
  const lastComma = text.lastIndexOf(",");
  if (lastComma >= 0) {
    // La coma es el separador decimal en es-CO.
    integerText = text.slice(0, lastComma);
    fractionText = text.slice(lastComma + 1);
    if (integerText.includes(",")) throw new MoneyParseError("Monto inválido");
  } else if (decimals > 0) {
    // "12.50" → decimal si hay un único punto seguido de 1-2 cifras.
    const m = /^(\d+)\.(\d{1,2})$/.exec(text);
    if (m) {
      integerText = m[1];
      fractionText = m[2];
    }
  }
  if (integerText.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(integerText)) {
    throw new MoneyParseError("Separador de miles inválido");
  }
  integerText = integerText.replace(/\./g, "");
  if (integerText === "") integerText = "0";
  if (!/^\d+$/.test(integerText) || !/^\d*$/.test(fractionText)) {
    throw new MoneyParseError("Monto inválido");
  }
  if (fractionText.length > decimals) {
    if (/^0*$/.test(fractionText.slice(decimals))) {
      fractionText = fractionText.slice(0, decimals);
    } else {
      throw new MoneyParseError(
        decimals === 0 ? "Esta moneda no admite decimales" : `Máximo ${decimals} decimales`,
      );
    }
  }
  const value =
    BigInt(integerText) * pow10(decimals) + BigInt((fractionText || "").padEnd(decimals, "0") || "0");
  return negative ? -value : value;
}

/** Convierte un número mayor exacto (ej. salida de un <input type="number">) a unidades mínimas. */
export function toMinorUnits(major: string | number, currency: string = BASE_CURRENCY): bigint {
  return parseMoney(String(major).replace(".", ","), currency);
}

/** Tasa "COP por 1 unidad" (texto, ej. "4012,35") → escalada ×1e6. */
export function parseRate(input: string): bigint {
  const normalized = input.trim().replace(/\./g, "").replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(normalized);
  if (!m) throw new MoneyParseError("Tasa inválida");
  const value = BigInt(m[1]) * RATE_SCALE + BigInt((m[2] ?? "").padEnd(6, "0"));
  if (value <= 0n) throw new MoneyParseError("La tasa debe ser mayor a 0");
  return value;
}

export function formatRate(rateMicros: bigint): string {
  const integer = groupThousands((rateMicros / RATE_SCALE).toString());
  const fraction = (rateMicros % RATE_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${integer},${fraction}` : integer;
}

/** División entera redondeando a la mitad alejándose de cero. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  const zero = 0n;
  const two = 2n;
  const negative = numerator < zero !== denominator < zero;
  const n = numerator < zero ? -numerator : numerator;
  const d = denominator < zero ? -denominator : denominator;
  const q = (n * two + d) / (two * d);
  return negative ? -q : q;
}

/**
 * Convierte un monto (unidades mínimas de `currency`) a COP usando una tasa
 * "COP por 1 unidad mayor" escalada ×1e6.
 */
export function convertToBase(amount: bigint, currency: CurrencyCode | string, rateMicros: bigint): bigint {
  if (currency === BASE_CURRENCY) return amount;
  const { decimals } = currencyInfo(currency);
  const baseDecimals = currencyInfo(BASE_CURRENCY).decimals;
  return divRound(amount * rateMicros * pow10(baseDecimals), pow10(decimals) * RATE_SCALE);
}

export function sumBigInt(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const v of values) total += v;
  return total;
}

/** Porcentaje (0-100+, con 1 decimal) sin pasar montos grandes a float antes de dividir. */
export function percentOf(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number(divRound(part * 1000n, total)) / 10;
}

/** Monto en unidades mínimas → texto editable sin símbolo ("8.000", "12,50"). */
export function formatAmountInput(amount: bigint, currency: string = BASE_CURRENCY): string {
  const { symbol } = currencyInfo(currency);
  return formatMoney(amount < 0n ? -amount : amount, currency).slice(symbol.length);
}

/**
 * Formatea en vivo lo que el usuario escribe: agrupa miles con punto y respeta
 * la coma decimal si la moneda la admite ("1250000" → "1.250.000").
 */
export function formatTypingAmount(raw: string, currency: string = BASE_CURRENCY): string {
  const { decimals } = currencyInfo(currency);
  let text = raw.replace(/[^\d,]/g, "");
  let fraction: string | null = null;
  const comma = text.indexOf(",");
  if (comma >= 0) {
    fraction = decimals > 0 ? text.slice(comma + 1).replace(/,/g, "").slice(0, decimals) : null;
    text = text.slice(0, comma);
  }
  const integer = text.replace(/^0+(?=\d)/, "");
  const grouped = integer ? groupThousands(integer) : fraction !== null ? "0" : "";
  return fraction !== null ? `${grouped},${fraction}` : grouped;
}

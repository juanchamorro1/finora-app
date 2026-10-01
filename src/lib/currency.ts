/**
 * Monedas soportadas. Los montos se guardan como BigInt en unidades mínimas
 * (`decimals` indica cuántas cifras decimales tiene la unidad mayor).
 * COP se maneja sin centavos: 1 unidad mínima = 1 peso.
 */
export const CURRENCIES = {
  COP: { code: "COP", name: "Peso colombiano", decimals: 0, symbol: "$" },
  USD: { code: "USD", name: "Dólar estadounidense", decimals: 2, symbol: "US$" },
  USDT: { code: "USDT", name: "Tether", decimals: 2, symbol: "USDT " },
  EUR: { code: "EUR", name: "Euro", decimals: 2, symbol: "€" },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const BASE_CURRENCY: CurrencyCode = "COP";

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return value in CURRENCIES;
}

export function currencyInfo(code: string) {
  if (!isCurrencyCode(code)) throw new Error(`Moneda no soportada: ${code}`);
  return CURRENCIES[code];
}

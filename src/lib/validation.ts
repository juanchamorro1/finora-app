import { z } from "zod";
import { CURRENCY_CODES } from "./currency";
import { isValidDateKey } from "./dates";

/**
 * Esquemas de entrada de formularios. Los montos llegan como texto (tal como
 * los escribe el usuario) y se convierten a BigInt en el servidor según la
 * moneda de la cuenta.
 */

const id = z.string().trim().min(1);
const optionalId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => v || null);
const moneyText = z.string().trim().min(1, "Ingresa un monto").max(30, "Monto demasiado largo");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .nullable()
    .transform((v) => v || null);
export const dateKey = z.string().refine(isValidDateKey, "Fecha inválida");

export const transactionFormSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  amount: moneyText,
  accountId: id.pipe(z.string().min(1, "Selecciona una cuenta")),
  toAccountId: optionalId,
  toAmount: optionalText(30),
  categoryId: optionalId,
  date: dateKey,
  description: optionalText(120),
  note: optionalText(500),
});
export type TransactionFormValues = z.input<typeof transactionFormSchema>;

export const accountTypeSchema = z.enum(["BANK", "DIGITAL_WALLET", "CASH", "CRYPTO", "OTHER"]);
export const currencySchema = z.enum(CURRENCY_CODES as [string, ...string[]]);

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(40, "Máximo 40 caracteres"),
  type: accountTypeSchema,
  currency: currencySchema,
});

export const createAccountSchema = accountFormSchema.extend({
  openingBalance: z.string().trim().max(30).optional().default(""),
});

export const updateAccountSchema = accountFormSchema.extend({
  /** Saldo inicial nuevo; ausente = no se modifica. */
  openingBalance: z.string().trim().max(30).optional(),
});

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(30, "Máximo 30 caracteres"),
  kind: z.enum(["INCOME", "EXPENSE"]),
  icon: z.string().trim().max(40).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
    .optional(),
});

/** Convierte un ZodError en errores por campo (primer mensaje de cada campo). */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

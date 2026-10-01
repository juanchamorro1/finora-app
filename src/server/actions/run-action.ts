import { z } from "zod";
import { fail, ok, type ActionFailure, type ActionResult } from "@/lib/action-result";
import { MoneyParseError } from "@/lib/money";
import { zodFieldErrors } from "@/lib/validation";
import { UnauthorizedError, requireActionUser } from "../auth/guard";
import { DomainError } from "../errors";

/**
 * Envoltorio común para Server Actions: exige sesión, valida la entrada con Zod,
 * ejecuta la operación con el id del usuario actual y convierte los errores conocidos en un ActionResult legible.
 * Los errores inesperados se registran y se muestran como un mensaje genérico.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  fn: (data: z.output<S>, userId: string) => Promise<T>,
): Promise<ActionResult<T>> {
  let userId: string;
  try {
    userId = await requireActionUser();
  } catch (error) {
    return toFailure(error);
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("Revisa los campos marcados", zodFieldErrors(parsed.error));
  }
  try {
    return ok(await fn(parsed.data, userId));
  } catch (error) {
    return toFailure(error);
  }
}

export function toFailure(error: unknown): ActionFailure {
  if (error instanceof DomainError) {
    return fail(error.message, error.field ? { [error.field]: error.message } : undefined);
  }
  if (error instanceof UnauthorizedError) {
    return fail(error.message);
  }
  if (error instanceof MoneyParseError) {
    return fail(error.message, { amount: error.message });
  }
  console.error("[finora] error inesperado en acción:", error);
  return fail("Ocurrió un error inesperado. Intenta de nuevo.");
}

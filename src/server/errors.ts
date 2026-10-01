/**
 * Error de dominio con mensaje apto para mostrar al usuario.
 * Los servicios lanzan DomainError; las Server Actions lo convierten en un resultado de error.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function assertDomain(condition: unknown, message: string, field?: string): asserts condition {
  if (!condition) throw new DomainError(message, field);
}

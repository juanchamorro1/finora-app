export type FieldErrors = Record<string, string>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: FieldErrors };

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult<undefined>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export type ActionFailure = { ok: false; error: string; fieldErrors?: FieldErrors };

export function fail(error: string, fieldErrors?: FieldErrors): ActionFailure {
  return { ok: false, error, fieldErrors };
}

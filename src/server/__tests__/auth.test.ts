import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "../auth/password";
import { authMode, createSessionToken, verifySessionToken } from "../auth/session";

describe("autenticación", () => {
  beforeEach(() => {
    vi.stubEnv("FINORA_SESSION_SECRET", "x".repeat(40));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("verifica contraseñas con scrypt", async () => {
    const hash = await hashPassword("mi clave segura");
    expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyPassword("mi clave segura", hash)).toBe(true);
    expect(await verifyPassword("otra clave", hash)).toBe(false);
    expect(await verifyPassword("mi clave segura", "basura")).toBe(false);
  });

  it("firma y valida la sesión, y rechaza manipulaciones y expiración", async () => {
    const now = Date.now();
    const { value } = await createSessionToken(now);
    expect(await verifySessionToken(value, now)).toBe(true);
    const [exp, sig] = value.split(".");
    expect(await verifySessionToken(`${Number(exp) + 999999}.${sig}`, now)).toBe(false);
    expect(await verifySessionToken(`${exp}.${sig.slice(0, -1)}A`, now)).toBe(false);
    expect(await verifySessionToken(value, Number(exp) + 1)).toBe(false);
    expect(await verifySessionToken(undefined, now)).toBe(false);
    vi.stubEnv("FINORA_SESSION_SECRET", "y".repeat(40));
    expect(await verifySessionToken(value, now)).toBe(false);
  });

  it("en producción exige contraseña configurada", () => {
    vi.stubEnv("FINORA_PASSWORD_HASH", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(authMode()).toBe("disabled");
    vi.stubEnv("NODE_ENV", "production");
    expect(authMode()).toBe("misconfigured");
    vi.stubEnv("FINORA_PASSWORD_HASH", "scrypt:aa:bb");
    expect(authMode()).toBe("enabled");
    vi.stubEnv("FINORA_SESSION_SECRET", "corto");
    expect(authMode()).toBe("misconfigured");
  });
});

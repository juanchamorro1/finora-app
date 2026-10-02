import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "../auth/password";
import { authMode, createSessionToken, shouldRenewSession, verifySessionToken } from "../auth/session";

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
    expect(await verifyPassword("mi clave segura", "PENDIENTE")).toBe(false);
  });

  it("la sesión identifica al usuario y rechaza manipulaciones y expiración", async () => {
    const now = Date.now();
    const { value } = await createSessionToken("usuario-a", now);
    expect(await verifySessionToken(value, now)).toBe("usuario-a");

    const [, exp, sig] = value.split(".");
    // Cambiar el usuario invalida la firma: nadie puede hacerse pasar por otro.
    expect(await verifySessionToken(`usuario-b.${exp}.${sig}`, now)).toBeNull();
    expect(await verifySessionToken(`usuario-a.${Number(exp) + 999999}.${sig}`, now)).toBeNull();
    const tampered = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(await verifySessionToken(`usuario-a.${exp}.${tampered}`, now)).toBeNull();
    expect(await verifySessionToken(`${value}.extra`, now)).toBeNull();
    expect(await verifySessionToken(value, Number(exp) + 1)).toBeNull();
    expect(await verifySessionToken(undefined, now)).toBeNull();
    vi.stubEnv("FINORA_SESSION_SECRET", "y".repeat(40));
    expect(await verifySessionToken(value, now)).toBeNull();
  });

  it("la sesión dura 6 meses y se renueva como máximo una vez al día", async () => {
    const now = Date.now();
    const { value, expires } = await createSessionToken("usuario-a", now);
    expect(Math.round((expires.getTime() - now) / 86_400_000)).toBe(180);
    expect(shouldRenewSession(value, now)).toBe(false);
    expect(shouldRenewSession(value, now + 3_600_000)).toBe(false);
    expect(shouldRenewSession(value, now + 2 * 86_400_000)).toBe(true);
  });

  it("en producción exige el secreto de sesión", () => {
    vi.stubEnv("FINORA_SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(authMode()).toBe("disabled");
    vi.stubEnv("NODE_ENV", "production");
    expect(authMode()).toBe("misconfigured");
    vi.stubEnv("FINORA_SESSION_SECRET", "corto");
    expect(authMode()).toBe("misconfigured");
    vi.stubEnv("FINORA_SESSION_SECRET", "z".repeat(40));
    expect(authMode()).toBe("enabled");
  });
});

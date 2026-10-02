import { afterEach, describe, expect, it, vi } from "vitest";
import { readEnv } from "../env";

describe("lectura tolerante de variables de entorno", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("corrige el nombre delante, comillas y espacios", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("X", "TURSO_AUTH_TOKEN=eyJabc.def");
    expect(readEnv("X")).toBe("eyJabc.def");
    vi.stubEnv("X", ' "libsql://base.turso.io" ');
    expect(readEnv("X")).toBe("libsql://base.turso.io");
    vi.stubEnv("X", "DATABASE_URL='libsql://base.turso.io'");
    expect(readEnv("X")).toBe("libsql://base.turso.io");
  });

  it("deja intactos los valores correctos (incluido un hash con dos puntos)", () => {
    vi.stubEnv("X", "libsql://base-user.turso.io");
    expect(readEnv("X")).toBe("libsql://base-user.turso.io");
    vi.stubEnv("X", "scrypt:ab:cd");
    expect(readEnv("X")).toBe("scrypt:ab:cd");
    vi.stubEnv("X", "");
    expect(readEnv("X")).toBeUndefined();
  });
});

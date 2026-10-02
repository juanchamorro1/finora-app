import { NextResponse } from "next/server";
import { createDb } from "@/server/db-client";
import { readEnv } from "@/server/env";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico de configuración SIN revelar valores: solo la forma de cada
 * variable y si la conexión a la base funciona. Útil cuando la app falla en
 * Vercel por variables mal copiadas.
 */
export async function GET() {
  const rawToken = process.env.DATABASE_AUTH_TOKEN ?? "";
  const url = readEnv("DATABASE_URL");
  const token = readEnv("DATABASE_AUTH_TOKEN");
  const secret = readEnv("FINORA_SESSION_SECRET");

  const report: Record<string, unknown> = {
    DATABASE_URL: url
      ? {
          definida: true,
          esquema: url.split("://")[0] + "://",
          terminaEnTursoIo: /\.turso\.io\/?$/.test(url),
          pareceUnToken: url.startsWith("eyJ"),
        }
      : { definida: false },
    DATABASE_AUTH_TOKEN: token
      ? {
          definida: true,
          longitud: token.length,
          empiezaPorEyJ: token.startsWith("eyJ"),
          puntos: (token.match(/\./g) ?? []).length,
          pareceUnaUrl: token.includes("://"),
          pareceHashDeContraseña: token.startsWith("scrypt:"),
          teniaNombreOComillas: token !== rawToken.trim(),
        }
      : { definida: false },
    FINORA_SESSION_SECRET: secret ? { definida: true, longitud: secret.length, suficiente: secret.length >= 32 } : { definida: false },
  };

  if (url) {
    const db = createDb(url, token);
    try {
      await db.$queryRawUnsafe("SELECT 1");
      report.conexion = "ok";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Nunca devolver fragmentos de credenciales.
      report.conexion = message
        .split("\n")
        .filter(Boolean)
        .slice(-1)[0]
        .replaceAll(token ?? "\u0000", "[token]")
        .replaceAll(url, "[url]")
        .replace(/eyJ[\w.-]+/g, "[token]")
        .slice(0, 200);
    } finally {
      await db.$disconnect();
    }
  }

  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}

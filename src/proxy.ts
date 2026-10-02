import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authMode, verifySessionToken } from "@/server/auth/session";

/**
 * Filtro rápido: sin sesión válida, todo se redirige a /login.
 * La verificación definitiva también ocurre en el layout y en cada Server Action.
 */
export async function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "disabled") return NextResponse.next();
  const valid = mode === "enabled" && (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value));
  if (valid) return NextResponse.next();
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Todo excepto /login y archivos públicos (estáticos, iconos, manifiesto de la PWA).
  matcher: ["/((?!login|api/diagnostico|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js).*)"],
};

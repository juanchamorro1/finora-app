import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  authMode,
  createSessionToken,
  shouldRenewSession,
  verifySessionToken,
} from "@/server/auth/session";

/**
 * Filtro rápido: sin sesión válida, todo se redirige a /login. Con sesión
 * válida, renueva la cookie (máximo una vez al día) para que nunca expire
 * mientras se use la app. La verificación definitiva también ocurre en las
 * páginas y en cada Server Action.
 */
export async function proxy(request: NextRequest) {
  const mode = authMode();
  if (mode === "disabled") return NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = mode === "enabled" ? await verifySessionToken(token) : null;
  if (claims && token) {
    const response = NextResponse.next();
    if (shouldRenewSession(token)) {
      const { value, expires } = await createSessionToken(claims.userId, claims.version);
      response.cookies.set(SESSION_COOKIE, value, { ...SESSION_COOKIE_OPTIONS, expires });
    }
    return response;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Todo excepto /login, la política de datos y archivos públicos (estáticos, iconos, PWA).
  matcher: ["/((?!login|politica-de-datos|_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js).*)"],
};

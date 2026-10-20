import { NextResponse, type NextRequest } from "next/server";
import { appOpen, closedAction } from "./lib/appOpen";
import { OCASIONES, OCASIONES_PATH } from "./lib/ocasiones";

const SLUGS = new Set(OCASIONES.map((o) => o.slug));

/**
 * Con la app cerrada (lib/appOpen.ts), /crear lleva a la landing y las rutas de la API que escriben, pintan o cobran
 * responden 404. No basta con esconder los botones: las rutas seguirían respondiendo y gastando.
 * Una página de ocasión que no existe da 404 de verdad (con Cache Components, notFound() dentro de la página llega con 200).
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path.startsWith(`${OCASIONES_PATH}/`) && !SLUGS.has(path.slice(OCASIONES_PATH.length + 1).replace(/\/$/, ""))) {
    return NextResponse.rewrite(new URL("/_no-existe", request.url));
  }
  if (appOpen()) return NextResponse.next();
  const action = closedAction(path);
  if (action.type === "redirect") return NextResponse.redirect(new URL(action.to, request.url), 307);
  if (action.type === "not_found") return NextResponse.json({ ok: false, error: "closed" }, { status: 404 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/crear", "/crear/:path*", "/api/:path*", "/cuento-personalizado/:path+"],
};

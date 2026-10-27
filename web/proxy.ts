import { NextResponse, type NextRequest } from "next/server";
import { appOpen, closedAction, openAction } from "./lib/appOpen";
import { OCASIONES, OCASIONES_PATH } from "./lib/ocasiones";
import { clientIp, envInt, rateLimit } from "./lib/rateLimit";

const SLUGS = new Set(OCASIONES.map((o) => o.slug));

/**
 * Con la app cerrada (lib/appOpen.ts), /crear lleva a la landing y las rutas de la API que escriben, pintan o cobran
 * responden 404. No basta con esconder los botones: las rutas seguirían respondiendo y gastando.
 * Con la app abierta, la API del flujo antiguo también responde 404 (auditoría del 26 oct, B5).
 * Una página de ocasión que no existe da 404 de verdad (con Cache Components, notFound() dentro de la página llega con 200).
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // un freno por IP para todo lo que abre un libro (menores de la auditoría 26 oct y revisión 27 oct): varias rutas dicen
  // si un id existe. Holgado (la pantalla pide la vista cada pocos segundos mientras se pinta) y sin espera mínima; cada
  // ruta cara lleva además el suyo
  if (path.startsWith("/api/libro/")) {
    const limit = rateLimit(`libro:${clientIp(request)}`, envInt("LIBRO_RATE_PER_HOUR", 1500), 0);
    if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  }
  if (path.startsWith(`${OCASIONES_PATH}/`) && !SLUGS.has(path.slice(OCASIONES_PATH.length + 1).replace(/\/$/, ""))) {
    return NextResponse.rewrite(new URL("/_no-existe", request.url));
  }
  if (appOpen()) {
    if (openAction(path).type === "not_found") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.next();
  }
  const action = closedAction(path);
  if (action.type === "redirect") return NextResponse.redirect(new URL(action.to, request.url), 307);
  if (action.type === "not_found") return NextResponse.json({ ok: false, error: "closed" }, { status: 404 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/crear", "/crear/:path*", "/api/:path*", "/cuento-personalizado/:path+"],
};

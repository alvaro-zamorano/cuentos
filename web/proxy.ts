import { NextResponse, type NextRequest } from "next/server";
import { appOpen, closedAction } from "./lib/appOpen";

/**
 * Con la app cerrada (lib/appOpen.ts), /crear lleva a la landing y las rutas de la API que escriben, pintan o cobran
 * responden 404. No basta con esconder los botones: las rutas seguirían respondiendo y gastando.
 */
export function proxy(request: NextRequest) {
  if (appOpen()) return NextResponse.next();
  const action = closedAction(request.nextUrl.pathname);
  if (action.type === "redirect") return NextResponse.redirect(new URL(action.to, request.url), 307);
  if (action.type === "not_found") return NextResponse.json({ ok: false, error: "closed" }, { status: 404 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/crear", "/crear/:path*", "/api/:path*"],
};

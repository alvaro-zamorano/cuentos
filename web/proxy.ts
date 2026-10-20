import { NextResponse, type NextRequest } from "next/server";
import { appEnabled, gate, WAITLIST_PATH } from "@/lib/launch";
import { OCASIONES, OCASIONES_PATH } from "@/lib/ocasiones";

const SLUGS = new Set(OCASIONES.map((o) => o.slug));

/**
 * Interruptor de la app (lib/launch.ts). Con la app cerrada, /crear lleva a la lista de espera (con la idea, si la
 * había) y las rutas de la API que gastan responden 503. Con la app abierta, la lista de espera lleva a /crear.
 */
export function proxy(req: NextRequest) {
  // una ocasión que no existe: 404 de verdad (con Cache Components, notFound() dentro de la página llega con 200)
  const path = req.nextUrl.pathname;
  if (path.startsWith(`${OCASIONES_PATH}/`) && !SLUGS.has(path.slice(OCASIONES_PATH.length + 1).replace(/\/$/, ""))) {
    return NextResponse.rewrite(new URL("/_no-existe", req.url));
  }
  const g = gate(path, appEnabled());
  if (!g) return NextResponse.next();
  if (g.kind === "api") return NextResponse.json({ ok: false, error: "closed" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const url = req.nextUrl.clone();
  const idea = req.nextUrl.searchParams.get("idea");
  url.pathname = g.kind === "page" ? WAITLIST_PATH : "/crear";
  // a la lista solo viaja la idea; un enlace a un libro (?b=) no tiene sentido mientras la app está cerrada
  url.search = idea && /^[a-z0-9-]{1,30}$/.test(idea) ? `?idea=${idea}` : "";
  return NextResponse.redirect(url, 307);
}

export const config = {
  matcher: ["/crear/:path*", "/lista-de-espera/:path*", "/api/:path*", "/cuento-personalizado/:path+"],
};

/**
 * ¿Está abierta la app (/crear y las rutas que escriben, pintan o cobran)? Decisión de Álvaro (20 oct): la landing y
 * los legales salen a producción antes que la app, con «Muy pronto».
 *
 *   APP_OPEN=1  abierta
 *   APP_OPEN=0  cerrada (también fuera de producción, para probar el cierre en local)
 *   sin valor   abierta fuera de producción (la preview sigue completa) y cerrada en producción
 *
 * La landing es estática: un cambio de APP_OPEN pide volver a desplegar. El proxy lo lee en cada petición.
 */
export type Env = Record<string, string | undefined>;

export function appOpen(env: Env = process.env): boolean {
  const v = env.APP_OPEN?.trim();
  if (v === "1") return true;
  if (v === "0") return false;
  return env.VERCEL_ENV !== "production";
}

/**
 * Rutas de la API que siguen vivas con la app cerrada: no gastan y las llaman otros servicios (crons de Vercel,
 * correo entrante de Resend, avisos firmados de Stripe y Gelato) o sirven para comprobar el despliegue.
 */
const OPEN_API = ["/api/health", "/api/cron/", "/api/mail/inbound", "/api/stripe/webhook", "/api/print/webhook"];

export type ClosedAction = { type: "pass" } | { type: "redirect"; to: string } | { type: "not_found" };

/** Qué hace el proxy con una ruta cuando la app está cerrada. */
export function closedAction(pathname: string): ClosedAction {
  if (pathname === "/crear" || pathname.startsWith("/crear/")) return { type: "redirect", to: "/#pronto" };
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    const ok = OPEN_API.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
    return ok ? { type: "pass" } : { type: "not_found" };
  }
  return { type: "pass" };
}

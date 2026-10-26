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

/**
 * Con la app abierta solo pasa la API que usa el flujo nuevo (/crear), más la de OPEN_API. Lo demás es del flujo antiguo
 * (Clásico e Ilustrado: fuera del embudo por D1, sus páginas redirigen a /crear desde el 16 oct) y responde 404, también
 * en la preview. Auditoría del 26 oct (B5): /api/generate/sample devolvía el enlace del libro de cualquier familia con
 * solo su email. Una ruta nueva de la API hay que añadirla aquí: un test comprueba que cada ruta de app/api está en
 * APP_API o en LEGACY_API.
 */
export const APP_API = ["/api/plan", "/api/libro/", "/api/generate/run", "/api/dev", ...OPEN_API];

/** Rutas del flujo antiguo: nada de la web nueva las llama. Siempre 404 (el código se queda, por si se recupera algo). */
export const LEGACY_API = ["/api/books", "/api/jobs", "/api/story", "/api/lead", "/api/pdf", "/api/generate/sample", "/api/generate/book", "/api/generate/status"];

export type ClosedAction = { type: "pass" } | { type: "redirect"; to: string } | { type: "not_found" };

/** `p` acaba en «/»: prefijo. Si no: la ruta exacta o algo por debajo de ella. */
function listed(list: string[], pathname: string): boolean {
  return list.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
}

function isApi(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** Qué hace el proxy con una ruta cuando la app está cerrada. */
export function closedAction(pathname: string): ClosedAction {
  if (pathname === "/crear" || pathname.startsWith("/crear/")) return { type: "redirect", to: "/#pronto" };
  if (isApi(pathname)) return listed(OPEN_API, pathname) ? { type: "pass" } : { type: "not_found" };
  return { type: "pass" };
}

/** Qué hace el proxy con una ruta cuando la app está abierta: la API del flujo antiguo, 404. */
export function openAction(pathname: string): ClosedAction {
  if (isApi(pathname)) return listed(APP_API, pathname) ? { type: "pass" } : { type: "not_found" };
  return { type: "pass" };
}

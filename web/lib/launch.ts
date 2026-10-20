/**
 * Interruptor de la app (20 oct, Álvaro): producción sale primero solo con la landing, las páginas de ocasión y una
 * lista de espera. `APP_ENABLED=1` abre /crear y las rutas que gastan; `APP_ENABLED=0` las cierra. Sin la variable, la
 * app está cerrada en producción y abierta en las previews y en local (falla cerrada: olvidarse de la variable no abre
 * nada con coste).
 *
 * La lee el proxy en cada petición; las páginas estáticas (landing, ocasiones) la leen al construir, así que un cambio
 * pide volver a desplegar.
 */
export function appEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.APP_ENABLED?.trim();
  if (v === "1") return true;
  if (v === "0") return false;
  return env.VERCEL_ENV !== "production";
}

export const WAITLIST_PATH = "/lista-de-espera";

/** Páginas de la app: con la app cerrada, a la lista de espera. */
const APP_PAGES = ["/crear"];

/**
 * Rutas de la API que gastan (Claude, Gemini, Supabase) o que solo sirven a la app. Con la app cerrada, 503.
 * Siguen abiertas: health, cron (borrado a 30 días), mail (correo de hola@), los webhooks de Stripe y Gelato y la lista.
 */
const APP_APIS = ["/api/plan", "/api/libro", "/api/generate", "/api/story", "/api/jobs", "/api/books", "/api/pdf", "/api/lead", "/api/dev"];

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

export type Gate = { kind: "page" } | { kind: "api" } | { kind: "waitlist-open" } | null;

/** Qué hacer con una ruta según el interruptor. null: dejarla pasar. */
export function gate(pathname: string, open: boolean): Gate {
  if (open) return under(pathname, WAITLIST_PATH) ? { kind: "waitlist-open" } : null;
  if (APP_PAGES.some((p) => under(pathname, p))) return { kind: "page" };
  if (APP_APIS.some((p) => under(pathname, p))) return { kind: "api" };
  return null;
}

/** Destino y texto de un botón de empezar: a /crear con la app abierta; a la lista de espera con ella cerrada. */
export function startCta(open: boolean, idea?: string): { href: string; closed: boolean } {
  const q = idea ? `?idea=${encodeURIComponent(idea)}` : "";
  return open ? { href: `/crear${q}`, closed: false } : { href: `${WAITLIST_PATH}${q}`, closed: true };
}

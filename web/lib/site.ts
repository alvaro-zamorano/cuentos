/**
 * Origen público y si el sitio se deja indexar (robots, sitemap). Solo se indexa producción con SITE_URL puesto (el
 * dominio de la marca): las previews y el alias *.vercel.app de producción quedan fuera de los buscadores.
 */
export function siteUrl(env: Record<string, string | undefined> = process.env): string | null {
  const v = env.SITE_URL?.trim().replace(/\/+$/, "");
  return v && /^https:\/\/[a-z0-9.-]+$/i.test(v) ? v : null;
}

export function indexable(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === "production" && !!siteUrl(env);
}

/** Páginas públicas que van al sitemap (el flujo antiguo redirige a /crear y no entra). */
export const PUBLIC_PATHS = ["/", "/crear", "/privacidad", "/condiciones", "/aviso-legal"] as const;

/** Las del sitemap: sin /crear mientras la app esté cerrada (lib/appOpen.ts). */
export function sitemapPaths(open: boolean): string[] {
  return PUBLIC_PATHS.filter((p) => open || p !== "/crear");
}

/**
 * Los alias de producción en vercel.app (`cuentos-pi.vercel.app` y los de cada despliegue) llevan al dominio de la marca
 * (auditoría 26 oct, I21): si no, Google reparte la portada entre varios dominios. Solo en producción y con SITE_URL; la
 * API se queda donde está (los webhooks y el cron no siguen redirecciones). Devuelve adónde, o null.
 */
export function brandRedirect(host: string | null, path: string, search: string, env: Record<string, string | undefined> = process.env): string | null {
  const base = siteUrl(env);
  if (env.VERCEL_ENV !== "production" || !base || !host) return null;
  if (!host.toLowerCase().split(":")[0].endsWith(".vercel.app")) return null;
  if (path === "/api" || path.startsWith("/api/")) return null;
  return `${base}${path}${search}`;
}

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
 * (auditoría 26 oct, I21): si no, Google reparte la portada entre varios dominios. Son redirecciones de next.config
 * (las resuelve Vercel antes de llegar a ninguna función, también para las imágenes de public/). Solo al compilar
 * producción con SITE_URL. La API se queda donde está (los webhooks y el cron no siguen redirecciones), y la URL propia
 * del despliegue (VERCEL_URL) tampoco redirige, para poder revisar uno que aún no está en el dominio (revisión 27 oct).
 */
export interface BrandRedirect {
  source: string;
  destination: string;
  permanent: true;
  has: { type: "host"; value: string }[];
  missing?: { type: "host"; value: string }[];
}

export function brandRedirects(env: Record<string, string | undefined> = process.env): BrandRedirect[] {
  const base = siteUrl(env);
  if (env.VERCEL_ENV !== "production" || !base) return [];
  const has = [{ type: "host" as const, value: "(?<alias>.+)\\.vercel\\.app" }];
  const own = env.VERCEL_URL?.trim();
  const missing = own ? [{ type: "host" as const, value: own.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") }] : undefined;
  return [
    { source: "/", destination: `${base}/`, permanent: true, has, ...(missing ? { missing } : {}) },
    { source: "/:path((?!api/|api$).+)", destination: `${base}/:path`, permanent: true, has, ...(missing ? { missing } : {}) },
  ];
}

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

/** Páginas públicas que van al sitemap (el flujo antiguo redirige a /crear y no entra; las ocasiones, en sitemap.ts). */
export const PUBLIC_PATHS = ["/", "/crear", "/privacidad", "/condiciones", "/aviso-legal"] as const;

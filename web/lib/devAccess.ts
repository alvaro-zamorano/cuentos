import { timingSafeEqual } from "node:crypto";

/**
 * ¿Se puede usar /api/dev? Cuesta dinero (fuerza Gemini y Claude), así que:
 * - en producción, nunca;
 * - en Vercel fuera de producción (previews, que son públicas porque la protección de despliegues está desactivada),
 *   solo con DEV_TOKEN definido y el mismo valor en `?token=` o en la cabecera `x-dev-token`;
 * - en local (sin VERCEL_ENV), sí.
 */
export function devAccessAllowed(env: Record<string, string | undefined>, given: string | null | undefined): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (!env.VERCEL_ENV) return true;
  const expected = env.DEV_TOKEN?.trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function devTokenFrom(req: Request): string | null {
  return req.headers.get("x-dev-token") ?? new URL(req.url).searchParams.get("token");
}

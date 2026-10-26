import { timingSafeEqual } from "node:crypto";

/**
 * Crons de Vercel (`/api/cron/*`): `Authorization: Bearer $CRON_SECRET`.
 *
 * Sin `CRON_SECRET` solo responden en local (sin VERCEL_ENV). En cualquier despliegue de Vercel, también en las previews,
 * dan «missing». Antes (13 oct) la preview los dejaba lanzar sin secreto para probarlos, pero es pública y escribe en la
 * misma base que producción: cualquiera podía lanzar el de la imprenta, que manda recordatorios a clientes reales con
 * enlaces a la preview, o el de borrado (auditoría 26 oct, B1). Para lanzarlos en la preview, `CRON_SECRET` en Preview.
 *
 * La comparación es de tiempo constante.
 */
export function cronAuthorized(req: Request, env: Record<string, string | undefined> = process.env): "ok" | "unauthorized" | "missing" {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return env.VERCEL_ENV ? "missing" : "ok";
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected) ? "ok" : "unauthorized";
}

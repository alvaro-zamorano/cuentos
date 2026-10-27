/**
 * Límite por IP en memoria del proceso (cada instancia de Vercel lleva su cuenta: es un freno, no una garantía).
 * `perHour` por hora y clave y, por defecto, una por segundo.
 */
const buckets = new Map<string, number[]>();
const HOUR = 3_600_000;

export function rateLimit(key: string, perHour: number, minGapMs = 1000): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const list = (buckets.get(key) ?? []).filter((t) => now - t < HOUR);
  const last = list[list.length - 1];
  if (last !== undefined && now - last < minGapMs) return { ok: false, retryAfter: 1 };
  if (list.length >= perHour) return { ok: false, retryAfter: Math.ceil((HOUR - (now - list[0])) / 1000) };
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > HOUR) buckets.delete(k);
  }
  return { ok: true };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "local";
}

/** Entero de una variable de entorno; sin valor, o por debajo de `min` (1 por defecto), vale `fallback`. */
export function envInt(name: string, fallback: number, min = 1): number {
  const raw = process.env[name]?.trim();
  const v = Number(raw);
  return raw && Number.isFinite(v) && v >= min ? Math.floor(v) : fallback;
}

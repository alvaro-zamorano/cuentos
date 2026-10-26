import { NextResponse } from "next/server";
import { retryCast } from "@/lib/book/service";
import { clientIp, envInt, rateLimit } from "@/lib/rateLimit";
import { bad, paintLater, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/retry { bookId } → { bookId, sheetJobId, coverJobId }
 * «Reintentar» del paso 4 (auditoría 26 oct, B8): si la última hoja de personajes o su portada fallaron, las vuelve a
 * poner en cola (otra versión si ya no les quedan intentos) y las pinta en segundo plano. El navegador también las pide.
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const t0 = Date.now();
  const body = await readJson(req, 2_000);
  if (!body) return bad();
  const limit = rateLimit(`retry:${clientIp(req)}`, envInt("START_RATE_PER_HOUR", 10));
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  return withContext("retry", async (store, adapter) => {
    const r = await retryCast(store, body, adapter);
    if (r.ok) paintLater("retry", store, adapter, [r.sheetJobId, r.coverJobId], { t0, maxDurationS: maxDuration, concurrency: 1 });
    // los libros que cuentan nunca van a la pantalla (el email no está verificado)
    if (!r.ok && r.error === "free_limit") return { ok: false as const, status: 429, error: "free_limit" };
    return r;
  });
}

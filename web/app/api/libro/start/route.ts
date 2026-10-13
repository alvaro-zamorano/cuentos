import { NextResponse } from "next/server";
import { startBook } from "@/lib/book/service";
import { clientIp, envInt, rateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { bad, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/start { email, consent, marketing?, ficha, plan, planMeta?, bookId? } → { bookId, sheetJobId, coverJobId }
 * Paso 4: con el email y la declaración del adulto guarda el libro, prepara el reparto y encola hoja + portada.
 * Las imágenes se pintan después con POST /api/generate/run (una por llamada).
 */
export const maxDuration = 120;

export async function POST(req: Request) {
  const body = await readJson(req);
  if (!body) return bad();
  if (body.consent !== true) return bad("consent");
  const limit = rateLimit(`start:${clientIp(req)}`, envInt("START_RATE_PER_HOUR", 10));
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const res = await withContext("start", (store, adapter) => startBook(store, body, adapter));
  // el lead se guarda aunque falle la generación (presupuesto, proveedor): el email ya lo ha dado
  const db = supabaseAdmin();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (db && email) {
    const { error } = await db.from("cuentos_leads").upsert({ email, marketing: body.marketing === true, edition: "illustrated", source: "cuentos-web" }, { onConflict: "email,edition" });
    if (error) console.error("[libro/start] lead", error.code);
  }
  return res;
}

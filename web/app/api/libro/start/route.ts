import { after, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/book/background";
import { startBook } from "@/lib/book/service";
import { sendBookLink } from "@/lib/mail";
import { clientIp, envInt, rateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { bad, paintLater, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/start { email, consent, marketing?, ficha, plan, planMeta?, bookId? } → { bookId, sheetJobId, coverJobId }
 * Paso 4: con el email y la declaración del adulto guarda el libro, prepara el reparto y encola hoja + portada.
 * Después de responder pinta hoja y portada en segundo plano y, si el libro es nuevo, manda el enlace por email.
 * El navegador también las pide con POST /api/generate/run (una por llamada).
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const t0 = Date.now();
  const body = await readJson(req);
  if (!body) return bad();
  if (body.consent !== true) return bad("consent");
  const limit = rateLimit(`start:${clientIp(req)}`, envInt("START_RATE_PER_HOUR", 10));
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const origin = publicOrigin(req);
  const res = await withContext("start", async (store, adapter) => {
    const r = await startBook(store, body, adapter);
    if (r.ok) {
      paintLater("start", store, adapter, [r.sheetJobId, r.coverJobId], { t0, maxDurationS: maxDuration, concurrency: 1 });
      if (r.fresh && r.email) {
        const { email, title = "Tu cuento", bookId } = r;
        after(async () => {
          const m = await sendBookLink(email, title, `${origin}/crear?b=${bookId}`);
          if (!m.sent && m.reason !== "sin_configurar") console.error("[libro/start] email", m.reason);
        });
      }
    }
    // el email y el título solo sirven aquí: no vuelven al navegador
    if (r.ok) return { ...r, email: undefined, title: undefined };
    return r;
  });
  // el lead se guarda aunque falle la generación (presupuesto, proveedor): el email ya lo ha dado
  const db = supabaseAdmin();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (db && email) {
    const { error } = await db.from("cuentos_leads").upsert({ email, marketing: body.marketing === true, edition: "illustrated", source: "cuentos-web" }, { onConflict: "email,edition" });
    if (error) console.error("[libro/start] lead", error.code);
  }
  return res;
}

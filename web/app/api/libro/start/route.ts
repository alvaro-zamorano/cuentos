import { after, NextResponse } from "next/server";
import { publicOrigin } from "@/lib/book/background";
import { mailYourBooks } from "@/lib/book/freeLimit";
import { startBook, type FreeLimitFail } from "@/lib/book/service";
import { titular } from "@/lib/legal";
import { sendBookLink, sendYourBooks } from "@/lib/mail";
import { clientIp, envInt, rateLimit } from "@/lib/rateLimit";
import { recordLead } from "@/lib/marketing";
import { supabaseAdmin } from "@/lib/supabase/server";
import { bad, paintLater, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/start { email, consent, marketing?, ficha, plan, planMeta?, bookId? } → { bookId, sheetJobId, coverJobId }
 * (o 429 { error: "free_limit", mailed?, contact? } si el buzón ya tiene sus cuentos gratis: mailed dice si han salido por
 * email y, si no, contact es el email al que escribirnos)
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
    // sin cuentos gratis en el periodo: los que tiene van por email, nunca a la pantalla (el email no está verificado).
    // Cada uno al email guardado en su libro, y antes de responder: la pantalla solo dice que se han mandado si han
    // salido (auditoría 26 oct, menores). `mailed` no va sin el correo configurado: la pantalla dice lo de siempre
    if (r.error === "free_limit" && "books" in r) {
      const mailed = await mailYourBooks((r as FreeLimitFail).books, origin, sendYourBooks);
      return { ok: false as const, status: 429, error: "free_limit", ...(mailed === null ? {} : { mailed }), ...(mailed === false ? { contact: titular().email ?? null } : {}) };
    }
    return r;
  });
  // el lead se guarda aunque falle la generación (presupuesto, proveedor): el email ya lo ha dado
  const db = supabaseAdmin();
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (db && email) {
    // con la casilla marcada, el consentimiento con su fecha y su texto; sin marcarla no se toca uno anterior (lib/marketing.ts)
    const r = await recordLead(db, { email, marketing: body.marketing === true });
    if (!r.ok) console.error("[libro/start] lead", r.error);
  }
  return res;
}

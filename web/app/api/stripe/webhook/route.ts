import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/book/background";
import { notifyBookReady, pendingPageJobs, recordStripePayment, requestPages } from "@/lib/book/service";
import { generationContext } from "@/lib/generation/server";
import { readyMail } from "@/lib/book/readyMail";
import { sendSupportNotice } from "@/lib/mail";
import { eventModeAllowed, verifyWebhook } from "@/lib/stripe";
import { paintLater } from "../../libro/_shared";

/**
 * POST /api/stripe/webhook (B5). Verifica la firma con STRIPE_WEBHOOK_SECRET, registra el pedido de
 * `checkout.session.completed` (idempotente) y, después de responder a Stripe, encola y pinta las 12 páginas y manda el
 * email de «tu libro está listo». Si el padre sigue en la página, su navegador también pinta los mismos jobs.
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const t0 = Date.now();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "stripe_off" }, { status: 501 });
  const payload = await req.text();
  if (payload.length > 500_000) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  const event = verifyWebhook(payload, req.headers.get("stripe-signature"), secret);
  if (!event) return NextResponse.json({ ok: false, error: "signature" }, { status: 400 });
  if (!eventModeAllowed(event)) {
    // 200 para que Stripe no reintente: el evento es válido, pero de prueba en producción
    console.warn(`[stripe] ${event.type} de prueba en producción: ignorado`);
    return NextResponse.json({ received: true, ignored: "test_mode" });
  }
  const ctx = generationContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: 503 }); // Stripe reintenta
  const { store, adapter } = ctx;
  try {
    const r = await recordStripePayment(store, event);
    console.log(`[stripe] ${event.type} → ${r.action}${r.action === "ignored" ? ` (${r.reason})` : ""}`);
    const s = event.data.object;
    if (r.action === "ignored" && s.metadata?.upgrade === "1" && s.payment_status === "paid") {
      // mejora a tapa dura cobrada que no se ha podido registrar (libro caducado, sin PDF pagado o ya en tapa dura): devolverla a mano
      await sendSupportNotice(
        "Mejora a tapa dura cobrada sin registrar",
        `Stripe cobró una mejora a tapa dura que no se ha podido registrar (${r.reason}).\nLibro: ${s.metadata?.bookId ?? "?"}\nSesión: ${s.id ?? "?"}\nImporte: ${((s.amount_total ?? 0) / 100).toFixed(2)} €\n\nRevísala y devuélvela desde el panel de Stripe si hace falta.`,
      ).catch(() => null);
    }
    if (r.action === "paid") {
      const origin = publicOrigin(req);
      paintLater(
        "stripe",
        store,
        adapter,
        async () => {
          const p = await requestPages(store, { bookId: r.bookId }, adapter, { dryRunPayment: false });
          if (!p.ok) console.error("[stripe] páginas", p.error);
          return p.ok ? pendingPageJobs(store, r.bookId) : [];
        },
        { t0, maxDurationS: maxDuration, then: () => notifyBookReady(store, r.bookId, (id) => `${origin}/crear?b=${id}`, readyMail) },
      );
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe] webhook", e instanceof Error ? e.message.slice(0, 200) : "error");
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

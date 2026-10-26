import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/book/background";
import { notifyBookReady, paymentNotice, pendingPageJobs, recordStripePayment, requestPages } from "@/lib/book/service";
import { generationContext } from "@/lib/generation/server";
import { readyMail } from "@/lib/book/readyMail";
import { sendSupportNotice } from "@/lib/mail";
import { eventModeAllowed, verifyWebhook } from "@/lib/stripe";
import { paintLater } from "../../libro/_shared";

/**
 * POST /api/stripe/webhook (B5). Verifica la firma con STRIPE_WEBHOOK_SECRET, registra el pedido de
 * `checkout.session.completed` (idempotente) y, después de responder a Stripe, encola y pinta las 12 páginas y manda el
 * email de «tu libro está listo». Si el padre sigue en la página, su navegador también pinta los mismos jobs.
 * Si la base falla al leer o al escribir, 500: Stripe reintenta. Un cobro que no se puede registrar, doble o con un importe
 * que no cuadra manda un aviso a soporte (`paymentNotice`).
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
    // cobro sin pedido, cobro doble o importe que no cuadra: aviso para devolverlo a mano. El error queda en los logs
    // aunque falle el email (auditoría 26 oct, B7)
    const notice = paymentNotice(r, event);
    if (notice) {
      console.error(`[stripe] ${notice.subject}: ${notice.text.split("\n")[0]} · sesión ${event.data.object.id ?? "?"}`);
      await sendSupportNotice(notice.subject, notice.text).catch(() => null);
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

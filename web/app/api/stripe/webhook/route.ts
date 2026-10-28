import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/book/background";
import { chargeNotice, isChargeEvent, recordChargeEvent, type ChargeEvent } from "@/lib/book/refunds";
import { alertPaidFailures, mailReceipt, notifyBookReady, paymentNotice, pendingPageJobs, recordStripePayment, requestPages, receiptNotice, retryUnsentNotice } from "@/lib/book/service";
import { generationContext } from "@/lib/generation/server";
import { readyMail } from "@/lib/book/readyMail";
import { holderLine, titular } from "@/lib/legal";
import { sendOrderConfirmed, sendSupportNotice, type MailResult } from "@/lib/mail";
import { eventModeAllowed, sessionForPaymentIntent, verifyWebhook } from "@/lib/stripe";
import { paintLater } from "../../libro/_shared";

/**
 * POST /api/stripe/webhook (B5). Verifica la firma con STRIPE_WEBHOOK_SECRET, registra el pedido de
 * `checkout.session.completed` (idempotente) y, después de responder a Stripe, encola y pinta las 12 páginas y manda el
 * email de «tu libro está listo». Si el padre sigue en la página, su navegador también pinta los mismos jobs.
 * Si la base falla al leer o al escribir, 500: Stripe reintenta. Un cobro que no se puede registrar, doble o con un importe
 * que no cuadra manda un aviso a soporte (`paymentNotice`). Al registrar el pago manda el recibo (I28) antes de
 * responder. Devoluciones y disputas (`charge.refunded`, `charge.dispute.*`, I5): marcan el pedido, paran la tapa dura y
 * avisan. Si un aviso o el recibo no salen por un fallo pasajero, 500 para que Stripe reintente (`retryUnsentNotice`): el
 * reintento ve el evento repetido y vuelve a dar el mismo aviso.
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
    const origin = publicOrigin(req);
    const link = (id: string) => `${origin}/crear?b=${id}`;
    if (isChargeEvent(event.type)) {
      const c = await recordChargeEvent(store, event as unknown as ChargeEvent, { sessionOf: (pi) => sessionForPaymentIntent(pi) });
      console.log(`[stripe] ${event.type} → ${c.action}${c.action === "unmatched" || c.action === "ignored" ? ` (${c.reason})` : ""}`);
      const notice = chargeNotice(c, event as unknown as ChargeEvent);
      if (notice) {
        // una clave por evento: si Stripe lo vuelve a mandar y el aviso ya había salido, Resend no lo repite
        const mail = await sendSupportNotice(notice.subject, notice.text, { key: `stripe:${event.id}:aviso` }).catch((): MailResult => ({ sent: false, reason: "error" }));
        if (retryUnsentNotice(mail)) {
          console.warn(`[stripe] aviso a soporte sin enviar (${mail.reason}): Stripe reintentará`);
          return NextResponse.json({ ok: false, error: "notice" }, { status: 500 });
        }
      }
      return NextResponse.json({ received: true });
    }
    const r = await recordStripePayment(store, event);
    console.log(`[stripe] ${event.type} → ${r.action}${r.action === "ignored" ? ` (${r.reason})` : ""}`);
    // cobro sin pedido, cobro doble o importe que no cuadra: aviso para devolverlo a mano. El error queda en los logs
    // aunque falle el email (auditoría 26 oct, B7)
    const notice = paymentNotice(r, event);
    if (notice) {
      console.error(`[stripe] ${notice.subject}: ${notice.text.split("\n")[0]} · sesión ${event.data.object.id ?? "?"}`);
      const mail = await sendSupportNotice(notice.subject, notice.text, { key: `stripe:${event.id}:aviso` }).catch((): MailResult => ({ sent: false, reason: "error" }));
      if (retryUnsentNotice(mail)) {
        console.warn(`[stripe] aviso a soporte sin enviar (${mail.reason}): Stripe reintentará`);
        return NextResponse.json({ ok: false, error: "notice" }, { status: 500 });
      }
    }
    // también con «duplicate»: si Stripe reintenta porque la vez anterior falló después de guardar el pedido, las páginas
    // no se habían pedido (revisión 26 oct). Pedirlas otra vez no repite nada
    if (r.action === "paid" || r.action === "duplicate") {
      paintLater(
        "stripe",
        store,
        adapter,
        async () => {
          const p = await requestPages(store, { bookId: r.bookId }, adapter, { dryRunPayment: false });
          if (!p.ok) console.error("[stripe] páginas", p.error);
          return p.ok ? pendingPageJobs(store, r.bookId) : [];
        },
        {
          t0,
          maxDurationS: maxDuration,
          then: async () => {
            await notifyBookReady(store, r.bookId, link, readyMail);
            await alertPaidFailures(store, r.bookId, sendSupportNotice);
          },
        },
      );
    }
    // el recibo, antes de responder (revisión 27 oct): si falla por algo pasajero, 500 y Stripe reintenta el evento; el
    // pedido ya está y no se repite (`duplicate`), y el recibo sale una sola vez por sesión
    if (r.action === "paid" || r.action === "upgraded" || r.action === "duplicate") {
      const t = titular();
      const receipt = await mailReceipt(store, r, event, { send: sendOrderConfirmed, link, conditionsLink: `${origin}/condiciones`, seller: holderLine(t), contact: t.email ?? null }).catch(
        () => ({ status: "retry" }) as const,
      );
      if (receipt.status === "retry") {
        console.warn("[stripe] recibo sin enviar: Stripe reintentará");
        return NextResponse.json({ ok: false, error: "receipt" }, { status: 500 });
      }
      if (receipt.status === "rejected") {
        console.error(`[stripe] recibo rechazado (${receipt.reason})`);
        const book = await store.findBook({ publicId: r.bookId, includeExpired: true }).catch(() => null);
        const n = receiptNotice(receipt.to, receipt.reason, book?.id ?? null, event.data.object.id ?? null);
        const mail = await sendSupportNotice(n.subject, n.text, { key: `stripe:${event.id}:recibo` }).catch((): MailResult => ({ sent: false, reason: "error" }));
        // el reintento vuelve a probar el recibo, que se vuelve a rechazar, y vuelve a avisar
        if (retryUnsentNotice(mail)) {
          console.warn(`[stripe] aviso del recibo rechazado sin enviar (${mail.reason}): Stripe reintentará`);
          return NextResponse.json({ ok: false, error: "notice" }, { status: 500 });
        }
      }
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe] webhook", e instanceof Error ? e.message.slice(0, 200) : "error");
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { handleInbound, inboundEnabled, verifySvix, type InboundEvent } from "@/lib/inbound";

/**
 * POST /api/mail/inbound: webhook de Resend para el correo que llega a `@erasesuvez.com` (evento `email.received`).
 * Comprueba la firma (RESEND_WEBHOOK_SECRET) y reenvía el correo a MAIL_FORWARD_TO. Un error responde 500 para que
 * Resend lo reintente; el envío es idempotente, así que no llega dos veces.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!inboundEnabled()) return NextResponse.json({ ok: false, error: "inbound_off" }, { status: 501 });
  const payload = await req.text();
  if (payload.length > 200_000) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  const h = req.headers;
  const signed = verifySvix(payload, { id: h.get("svix-id"), timestamp: h.get("svix-timestamp"), signature: h.get("svix-signature") }, process.env.RESEND_WEBHOOK_SECRET!.trim());
  if (!signed) return NextResponse.json({ ok: false, error: "signature" }, { status: 400 });
  let event: InboundEvent;
  try {
    event = JSON.parse(payload) as InboundEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  const r = await handleInbound(event);
  // sin el contenido del correo en los logs: solo qué pasó
  console.log(`[correo] ${event.type} → ${r.action}${r.reason ? ` (${r.reason})` : ""}`);
  if (r.action === "error") return NextResponse.json({ ok: false, error: r.reason }, { status: 500 });
  return NextResponse.json({ received: true, action: r.action });
}

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { publicOrigin } from "@/lib/book/background";
import { handlePrintWebhook } from "@/lib/book/print";
import { generationContext } from "@/lib/generation/server";
import { printDeps } from "@/lib/print/server";

/**
 * POST /api/print/webhook?token=<GELATO_WEBHOOK_SECRET> — avisos de Gelato (order_status_updated,
 * order_item_tracking_code_updated…). Gelato no firma los avisos: el token en la URL filtra el ruido, y además no nos
 * fiamos del cuerpo: se vuelve a pedir el pedido a su API antes de cambiar nada (lib/book/print.ts).
 */
export async function POST(req: Request) {
  const secret = process.env.GELATO_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ ok: false, error: "webhook_off" }, { status: 501 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 200_000) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  let payload: unknown = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  const ctx = generationContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: 503 });
  try {
    const r = await handlePrintWebhook(ctx.store, payload, printDeps(publicOrigin(req)));
    const event = (payload as { event?: unknown })?.event;
    console.log(`[imprenta/webhook] ${typeof event === "string" ? event.slice(0, 60) : "?"} → ${r}`);
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[imprenta/webhook]", e instanceof Error ? e.message.slice(0, 200) : "error");
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/book/background";
import { checkoutInfo, PRICE_CENTS } from "@/lib/book/service";
import type { Fail } from "@/lib/generation/service";
import { clientIp, envInt, rateLimit } from "@/lib/rateLimit";
import { createCheckout, stripeEnabled, waiverAccepted } from "@/lib/stripe";
import { bad, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/checkout { bookId, waiver: true } → { url } de Stripe Checkout (B5). Sin la renuncia al desistimiento
 * marcada, 400. El pedido lo crea el webhook (/api/stripe/webhook) cuando Stripe confirma el cobro; Stripe vuelve a
 * /crear?b=<id>&pagado=1.
 */
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ ok: false, error: "payment_unavailable" }, { status: 501 });
  const body = await readJson(req, 2_000);
  if (!body) return bad();
  if (!waiverAccepted(body)) return bad("waiver_required");
  const waiverAt = new Date().toISOString();
  const limit = rateLimit(`checkout:${clientIp(req)}`, envInt("CHECKOUT_RATE_PER_HOUR", 20));
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const origin = publicOrigin(req);
  return withContext("checkout", async (store) => {
    const info = await checkoutInfo(store, body.bookId);
    if (!info.ok) return info;
    const r = await createCheckout({ bookId: info.bookId, email: info.email, title: info.title, amountCents: PRICE_CENTS, origin, waiverAt });
    if ("error" in r) {
      console.error("[libro/checkout]", r.error);
      return { ok: false, status: 502, error: "stripe" } satisfies Fail;
    }
    return { ok: true as const, url: r.url };
  });
}

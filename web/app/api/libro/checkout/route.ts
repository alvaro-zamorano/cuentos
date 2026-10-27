import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/book/background";
import { prepareCheckout, prepareUpgrade, rememberCheckoutShipping } from "@/lib/book/service";
import type { Fail } from "@/lib/generation/service";
import { printMode } from "@/lib/print/gelato";
import { clientIp, envInt, rateLimit } from "@/lib/rateLimit";
import { createCheckout, stripeEnabled, waiverAccepted } from "@/lib/stripe";
import { bad, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/checkout { bookId, waiver: true, edition: "hardcover" | "illustrated", shipping? } → { url } de Stripe
 * Checkout. Con `upgrade: true` y la dirección, pasar a tapa dura un libro ya pagado en PDF (se cobra la diferencia). La tapa dura pide la dirección (Península y Baleares) y solo se ofrece si hay imprenta aquí. Sin la renuncia
 * al desistimiento marcada, 400. El pedido lo crea el webhook (/api/stripe/webhook) cuando Stripe confirma el cobro.
 */
export async function POST(req: Request) {
  if (!stripeEnabled()) return NextResponse.json({ ok: false, error: "payment_unavailable" }, { status: 501 });
  const body = await readJson(req, 4_000);
  if (!body) return bad();
  if (!waiverAccepted(body)) return bad("waiver_required");
  const upgrade = body.upgrade === true;
  if ((upgrade || body.edition === "hardcover") && printMode() === "none") return NextResponse.json({ ok: false, error: "print_unavailable" }, { status: 501 });
  const waiverAt = new Date().toISOString();
  const limit = rateLimit(`checkout:${clientIp(req)}`, envInt("CHECKOUT_RATE_PER_HOUR", 20));
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const origin = publicOrigin(req);
  return withContext("checkout", async (store) => {
    const info = upgrade ? await prepareUpgrade(store, body) : await prepareCheckout(store, body);
    if (!info.ok) return info;
    const r = await createCheckout({ bookId: info.bookId, email: info.email, amountCents: info.amountCents, edition: info.edition, origin, waiverAt, upgrade });
    if ("error" in r) {
      console.error("[libro/checkout]", r.error);
      return { ok: false, status: 502, error: "stripe" } satisfies Fail;
    }
    // la dirección con la que se abre esta sesión: el pedido llevará esa, aunque otra pestaña escriba otra (menores de la
    // auditoría 26 oct). Si no se puede apuntar, el pedido usa la última escrita, como antes
    if (info.shipping) await rememberCheckoutShipping(store, info.bookId, r.id, info.shipping).catch((e: unknown) => console.warn("[libro/checkout] dirección de la sesión sin apuntar", e instanceof Error ? e.message.slice(0, 120) : ""));
    return { ok: true as const, url: r.url };
  });
}

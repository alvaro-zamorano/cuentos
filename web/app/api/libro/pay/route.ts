import { NextResponse } from "next/server";
import { payDryRun } from "@/lib/book/service";
import { DRY_RUN_PAYMENT_SERVER } from "@/lib/generation/server";
import { printMode } from "@/lib/print/gelato";
import { waiverAccepted } from "@/lib/stripe";
import { bad, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/pay { bookId, waiver: true, edition, shipping?, upgrade? } → pago de prueba (solo con NEXT_PUBLIC_DRY_RUN_PAYMENT=1 y fuera de
 * producción). Pide la misma casilla que el pago real. El pago real (Stripe, B5) crea el pedido desde /api/stripe/webhook.
 */
export async function POST(req: Request) {
  if (!DRY_RUN_PAYMENT_SERVER()) return NextResponse.json({ ok: false, error: "payment_unavailable" }, { status: 501 });
  const body = await readJson(req, 4_000);
  if (!body) return bad();
  if (!waiverAccepted(body)) return bad("waiver_required");
  if ((body.upgrade === true || body.edition === "hardcover") && printMode() === "none") return NextResponse.json({ ok: false, error: "print_unavailable" }, { status: 501 });
  return withContext("pay", (store) => payDryRun(store, body));
}

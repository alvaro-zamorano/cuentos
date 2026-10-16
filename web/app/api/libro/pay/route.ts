import { NextResponse } from "next/server";
import { payDryRun } from "@/lib/book/service";
import { DRY_RUN_PAYMENT_SERVER } from "@/lib/generation/server";
import { waiverAccepted } from "@/lib/stripe";
import { bad, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/pay { bookId, waiver: true } → pago de prueba (solo con NEXT_PUBLIC_DRY_RUN_PAYMENT=1 y fuera de
 * producción). Pide la misma casilla que el pago real. El pago real (Stripe, B5) crea el pedido desde /api/stripe/webhook.
 */
export async function POST(req: Request) {
  if (!DRY_RUN_PAYMENT_SERVER()) return NextResponse.json({ ok: false, error: "payment_unavailable" }, { status: 501 });
  const body = await readJson(req, 2_000);
  if (!body) return bad();
  if (!waiverAccepted(body)) return bad("waiver_required");
  return withContext("pay", (store) => payDryRun(store, body));
}

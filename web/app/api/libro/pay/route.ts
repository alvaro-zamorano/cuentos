import { NextResponse } from "next/server";
import { payDryRun } from "@/lib/book/service";
import { DRY_RUN_PAYMENT_SERVER } from "@/lib/generation/server";
import { bad, readJson, withContext } from "../_shared";

/**
 * POST /api/libro/pay { bookId } → pago de prueba (solo con NEXT_PUBLIC_DRY_RUN_PAYMENT=1 y fuera de producción). El pago
 * real (Stripe, B5) crea el pedido desde /api/stripe/webhook.
 */
export async function POST(req: Request) {
  if (!DRY_RUN_PAYMENT_SERVER()) return NextResponse.json({ ok: false, error: "payment_unavailable" }, { status: 501 });
  const body = await readJson(req, 2_000);
  if (!body) return bad();
  return withContext("pay", (store) => payDryRun(store, body));
}

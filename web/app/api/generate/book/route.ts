import { NextResponse } from "next/server";
import { DRY_RUN_PAYMENT_SERVER, generationContext } from "@/lib/generation/server";
import { requestBook, type BookInput } from "@/lib/generation/service";

/**
 * POST /api/generate/book { bookId, styleId, sheetJobId?, page?, draft? } → { ok, bookId, jobs }.
 * Tras el pago: crea los jobs de las páginas que faltan + portada (la página 9 de la muestra y la hoja no se repiten),
 * marcados `paid`. Con `page`, la otra versión de esa página (máximo una). Exige un pedido pagado en cuentos_orders,
 * salvo con NEXT_PUBLIC_DRY_RUN_PAYMENT=1.
 */
export async function POST(req: Request) {
  let body: BookInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  const ctx = generationContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: 503 });
  try {
    const r = await requestBook(ctx.store, body, ctx.adapter, { dryRunPayment: DRY_RUN_PAYMENT_SERVER() });
    if (!r.ok) return NextResponse.json(r, { status: r.status });
    return NextResponse.json(r);
  } catch (e) {
    console.error("[generate/book]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/book/background";
import { printCron } from "@/lib/book/print";
import { generationContext } from "@/lib/generation/server";
import { cronAuthorized, printDeps } from "@/lib/print/server";

/**
 * GET /api/cron/print — cron diario del libro impreso (vercel.json): recordatorios a quien no lo ha mandado a imprimir,
 * envíos atascados liberados para reintentar y consulta a la imprenta de los pedidos abiertos. Misma cabecera que el de
 * borrado (`Authorization: Bearer $CRON_SECRET`).
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = cronAuthorized(req);
  if (auth === "unauthorized") return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (auth === "missing") return NextResponse.json({ ok: false, error: "cron_secret_missing" }, { status: 503 });
  const ctx = generationContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: 503 });
  try {
    const report = await printCron(ctx.store, printDeps(publicOrigin(req)));
    console.log(`[cron/print] ${JSON.stringify(report)}`);
    return NextResponse.json({ ok: true, ...report }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron/print]", e instanceof Error ? e.message.slice(0, 200) : "error");
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

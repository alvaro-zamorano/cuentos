import { NextResponse } from "next/server";
import { publicOrigin } from "@/lib/book/background";
import { readyMail } from "@/lib/book/readyMail";
import { rescueBooks } from "@/lib/book/rescue";
import { cronAuthorized } from "@/lib/cronAuth";
import { generationContext } from "@/lib/generation/server";
import { sendSupportNotice } from "@/lib/mail";
import { PAINT_MARGIN_S } from "../../libro/_shared";

/**
 * GET /api/cron/rescue: rescate de libros pagados sin terminar (auditoría 26 oct, B4; lib/book/rescue.ts). Misma
 * cabecera que los otros crons (`Authorization: Bearer $CRON_SECRET`). En Hobby, Vercel solo admite crons diarios: con
 * Pro, cada 10 minutos (vercel.json).
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  const t0 = Date.now();
  const auth = cronAuthorized(req);
  if (auth === "unauthorized") return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (auth === "missing") return NextResponse.json({ ok: false, error: "cron_secret_missing" }, { status: 503 });
  const ctx = generationContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: 503 });
  const origin = publicOrigin(req);
  try {
    const report = await rescueBooks(ctx.store, {
      adapter: ctx.adapter,
      link: (id) => `${origin}/crear?b=${id}`,
      readyMail,
      notify: sendSupportNotice,
      deadline: t0 + (maxDuration - PAINT_MARGIN_S) * 1000,
    });
    console.log(`[cron/rescue] ${JSON.stringify(report)}`);
    return NextResponse.json({ ok: true, ...report }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron/rescue]", e instanceof Error ? e.message.slice(0, 200) : "error");
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

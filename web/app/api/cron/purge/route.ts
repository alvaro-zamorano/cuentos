import { NextResponse } from "next/server";
import { purgeExpired, supabasePurgeDb } from "@/lib/purge";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * GET /api/cron/purge[?dry=1] — borrado a 30 días (lib/purge.ts). Lo lanza el cron diario de Vercel (vercel.json), que
 * manda `Authorization: Bearer $CRON_SECRET`. Con CRON_SECRET puesto, sin esa cabecera → 401. Sin CRON_SECRET solo
 * funciona fuera de producción (para probarlo en la preview). `dry=1` cuenta sin borrar nada.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  } else if (process.env.VERCEL_ENV === "production") {
    return NextResponse.json({ ok: false, error: "cron_secret_missing" }, { status: 503 });
  }
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const report = await purgeExpired(supabasePurgeDb(db), { dryRun, deadline: Date.now() + 45_000 });
    console.log(`[cron/purge] ${JSON.stringify(report)}`);
    return NextResponse.json({ ok: true, ...report }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cron/purge]", e instanceof Error ? e.message.slice(0, 200) : "error");
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

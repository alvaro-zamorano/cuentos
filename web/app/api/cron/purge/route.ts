import { NextResponse } from "next/server";
import { purgeExpired, supabasePurgeDb } from "@/lib/purge";
import { sendSupportNotice } from "@/lib/mail";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cronAuthorized } from "@/lib/print/server";

/**
 * GET /api/cron/purge[?dry=1] — borrado a 30 días (lib/purge.ts). Lo lanza el cron diario de Vercel (vercel.json), que
 * manda `Authorization: Bearer $CRON_SECRET`. Con CRON_SECRET puesto, sin esa cabecera → 401. Sin CRON_SECRET solo
 * funciona en local (en la preview, con CRON_SECRET en Preview; lib/cronAuth.ts). `dry=1` cuenta sin borrar nada.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = cronAuthorized(req);
  if (auth === "unauthorized") return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (auth === "missing") return NextResponse.json({ ok: false, error: "cron_secret_missing" }, { status: 503 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const report = await purgeExpired(supabasePurgeDb(db), { dryRun, deadline: Date.now() + 45_000 });
    console.log(`[cron/purge] ${JSON.stringify(report)}`);
    // libros que no se han podido borrar: la pasada sigue con los demás, pero alguien tiene que mirarlo (I11)
    if (report.failed > 0)
      await sendSupportNotice(
        "El borrado de 30 días no ha podido con algunos libros",
        `La pasada del cron de borrado ha terminado, pero ${report.failed} libro(s) han fallado y siguen sin borrar:\n\n${report.errors.join("\n")}\n\nSe reintentan mañana. Si siguen fallando, míralo en Supabase (bucket y tablas cuentos_*) y en los logs de Vercel.`,
      ).catch(() => null);
    return NextResponse.json({ ok: true, ...report }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 200) : "error";
    console.error("[cron/purge]", msg);
    // el borrado a 30 días es una promesa de la política de privacidad: si falla, aviso a soporte (I12)
    await sendSupportNotice("El borrado de 30 días ha fallado", `La pasada del cron de borrado ha fallado: ${msg}\n\nSe repite mañana. Si sigue fallando, míralo en Supabase (bucket y tablas cuentos_*) y en los logs de Vercel.`).catch(() => null);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

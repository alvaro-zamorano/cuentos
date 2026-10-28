import { NextResponse } from "next/server";
import { unsubscribe } from "@/lib/marketing";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/baja { t } o POST /api/baja?t=… → baja de las novedades (menores de la auditoría 26 oct). La llave va en el
 * enlace de cada novedad (lib/marketing.ts). Con `?t=` en la URL vale también para la baja en un clic de los gestores de
 * correo (List-Unsubscribe-Post). Es un POST: un GET lo dispararían los antivirus que abren los enlaces.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let token = url.searchParams.get("t") ?? "";
  if (!token) {
    const body = (await req.json().catch(() => null)) as { t?: unknown } | null;
    token = typeof body?.t === "string" ? body.t : "";
  }
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
  const r = await unsubscribe(db, token.trim());
  if (r.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false, error: r.error }, { status: r.error === "not_found" ? 404 : 500 });
}

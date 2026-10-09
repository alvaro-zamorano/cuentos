import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PUBLIC_ID_RE } from "@/lib/ids";

/** GET /api/books/[public_id] — devuelve el borrador guardado (sin email) si no ha caducado. */
export async function GET(_req: Request, ctx: RouteContext<"/api/books/[public_id]">) {
  const { public_id } = await ctx.params;
  if (!PUBLIC_ID_RE.test(public_id)) return NextResponse.json({ ok: false, error: "id" }, { status: 400 });
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });

  const { data, error } = await db
    .from("cuentos_books")
    .select("public_id, draft, edition, status, expires_at")
    .eq("public_id", public_id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, book: data }, { headers: { "Cache-Control": "no-store" } });
}

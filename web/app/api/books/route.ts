import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { newPublicId } from "@/lib/ids";
import { EMAIL_RE, asEdition, isDraftLike } from "@/lib/validate";

/**
 * POST /api/books — guarda el borrador y devuelve su public_id.
 * Body: { draft, email?, public_id? }. Si llega public_id existente, actualiza ese libro.
 * Respuesta: { ok, public_id, url: "/crear?b=<public_id>" }.
 */
export async function POST(req: Request) {
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });

  let body: { draft?: unknown; email?: string; public_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  if (!isDraftLike(body.draft)) return NextResponse.json({ ok: false, error: "draft" }, { status: 400 });
  const draft = { ...body.draft, email: undefined }; // el email no se guarda dentro del draft
  const email = body.email && EMAIL_RE.test(body.email.trim()) ? body.email.trim().toLowerCase() : null;
  const edition = asEdition(body.draft.edition);

  if (body.public_id) {
    const { data, error } = await db
      .from("cuentos_books")
      .update({ draft: JSON.parse(JSON.stringify(draft)), edition, ...(email ? { email } : {}) })
      .eq("public_id", body.public_id)
      .gt("expires_at", new Date().toISOString())
      .select("public_id")
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
    if (data) return NextResponse.json({ ok: true, public_id: data.public_id, url: `/crear?b=${data.public_id}` });
    // no existe o ha caducado: se crea uno nuevo
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const public_id = newPublicId();
    const { error } = await db.from("cuentos_books").insert({ public_id, draft: JSON.parse(JSON.stringify(draft)), edition, email });
    if (!error) return NextResponse.json({ ok: true, public_id, url: `/crear?b=${public_id}` });
    if (error.code !== "23505") {
      console.error("[books] insert", error.code, error.message);
      return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: false, error: "id_collision" }, { status: 500 });
}

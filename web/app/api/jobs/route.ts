import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PUBLIC_ID_RE } from "@/lib/ids";
import { buildBook, normalizeDraft } from "@/lib/story";
import { describeTraitsEn } from "@/lib/traits";
import { getStyle } from "@/lib/generation/styles";
import type { Draft } from "@/lib/types";

/**
 * POST /api/jobs — encola trabajos de generación para un libro PAGADO (nada con coste antes del pago, PRD §6).
 * Body: { public_id, kind: "sheet" | "scenes", style_id }.
 * - "sheet": 1 job de hoja de personaje.
 * - "scenes": 12 jobs de escena; exige una hoja terminada y elegida (chosen) para ese libro y estilo.
 * Protegido con la cabecera x-cuentos-jobs-secret = JOBS_API_SECRET (hasta que exista el flujo de pago, lo llama Álvaro o Stripe).
 * No ejecuta nada: el worker del Mac Mini (scripts/worker.ts) recoge los jobs pending.
 */
export async function POST(req: Request) {
  const secret = process.env.JOBS_API_SECRET;
  if (!secret || req.headers.get("x-cuentos-jobs-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  if (!db) return NextResponse.json({ ok: false, error: "storage_unavailable" }, { status: 503 });

  let body: { public_id?: string; kind?: string; style_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  if (!body.public_id || !PUBLIC_ID_RE.test(body.public_id)) return NextResponse.json({ ok: false, error: "public_id" }, { status: 400 });
  if (body.kind !== "sheet" && body.kind !== "scenes") return NextResponse.json({ ok: false, error: "kind" }, { status: 400 });
  const style = getStyle(body.style_id ?? "");
  if (!style) return NextResponse.json({ ok: false, error: "style_id" }, { status: 400 });

  const { data: book, error } = await db.from("cuentos_books").select("id, draft, status").eq("public_id", body.public_id).maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
  if (!book) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (book.status !== "paid" && book.status !== "illustrating") {
    return NextResponse.json({ ok: false, error: "not_paid" }, { status: 402 });
  }
  const draft = normalizeDraft(book.draft as unknown as Partial<Draft>);

  const { data: existing } = await db
    .from("cuentos_generation_jobs")
    .select("id, kind, page_n, status, chosen")
    .eq("book_id", book.id)
    .eq("style_id", style.id)
    .in("status", ["pending", "running", "done"]);

  if (body.kind === "sheet") {
    if (existing?.some((j) => j.kind === "sheet")) return NextResponse.json({ ok: false, error: "sheet_exists" }, { status: 409 });
    const { data, error: insErr } = await db
      .from("cuentos_generation_jobs")
      .insert({ book_id: book.id, kind: "sheet", style_id: style.id, prompt: describeTraitsEn(draft.hero.traits), references: [{ kind: "anchor", style_id: style.id }] })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
    await db.from("cuentos_books").update({ status: "illustrating" }).eq("id", book.id);
    return NextResponse.json({ ok: true, jobs: [data.id] });
  }

  const sheet = existing?.find((j) => j.kind === "sheet" && j.status === "done" && j.chosen);
  if (!sheet) return NextResponse.json({ ok: false, error: "sheet_not_approved" }, { status: 409 });
  const already = new Set(existing?.filter((j) => j.kind === "scene").map((j) => j.page_n));
  const pages = buildBook(draft).pages.filter((p) => !already.has(p.n));
  if (pages.length === 0) return NextResponse.json({ ok: false, error: "scenes_exist" }, { status: 409 });
  const rows = pages.map((p) => ({
    book_id: book.id,
    kind: "scene",
    page_n: p.n,
    style_id: style.id,
    prompt: p.scenePrompt,
    references: [
      { kind: "sheet", job_id: sheet.id },
      { kind: "anchor", style_id: style.id },
    ],
  }));
  const { data, error: insErr } = await db.from("cuentos_generation_jobs").insert(rows).select("id");
  if (insErr) return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
  return NextResponse.json({ ok: true, jobs: data.map((d) => d.id) });
}

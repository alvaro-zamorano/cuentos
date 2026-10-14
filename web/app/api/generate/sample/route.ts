import { NextResponse } from "next/server";
import { generationContext } from "@/lib/generation/server";
import { requestSample, type SampleInput } from "@/lib/generation/service";

/**
 * POST /api/generate/sample { bookId | email, styleId, draft?, sheetVersion? } → { ok, bookId, sheetJobId, sampleJobId, sampleKey, sheetVersions }.
 * Crea (si no existen ya para esa huella) los jobs `sheet` y `sample` (página 9) de la muestra gratuita, tras comprobar
 * el presupuesto del lead (canSpend, lead = email). No ejecuta nada: el cliente llama a /api/generate/run.
 * `draft` solo se usa sin Supabase (almacén en memoria, dry-run); con Supabase manda el borrador guardado del libro.
 */
export async function POST(req: Request) {
  let body: SampleInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  const ctx = generationContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: 503 });
  try {
    const r = await requestSample(ctx.store, body, ctx.adapter);
    if (!r.ok) return NextResponse.json(r, { status: r.status });
    return NextResponse.json(r);
  } catch (e) {
    console.error("[generate/sample]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { generationContext } from "@/lib/generation/server";
import { runJob } from "@/lib/generation/service";

/** Una imagen por llamada; con proveedor real tarda 10–40 s. */
export const maxDuration = 60;

/**
 * POST /api/generate/run { jobId } → { ok, job: { id, status } , ran }.
 * Procesa UN job pendiente: lo reclama (running, bloqueo optimista por updated_at), llama al adaptador
 * (GENERATION_PROVIDER), sube el PNG al bucket privado `cuentos`, guarda ruta y coste, registra el gasto y lo marca
 * `done`; si falla, `failed` con el mensaje recortado. Con dry-run no hay imagen: `done` con placeholder.
 * 409 waiting_sheet si la hoja aún no está; 429 budget si un job pagado no cabe hoy en el tope diario.
 */
export async function POST(req: Request) {
  let body: { jobId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  const ctx = generationContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: 503 });
  try {
    const r = await runJob(ctx.store, body.jobId, ctx.adapter);
    if (!r.ok) return NextResponse.json(r, { status: r.status });
    return NextResponse.json({ ok: true, ran: r.ran, job: { id: r.job.id, status: r.job.status } });
  } catch (e) {
    console.error("[generate/run]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
  }
}

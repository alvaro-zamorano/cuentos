import { NextResponse } from "next/server";
import { generationContext } from "@/lib/generation/server";
import { jobStatus } from "@/lib/generation/service";

/**
 * GET /api/generate/status?bookId= → { ok, provider, jobs: [{ id, kind, page, variant, status, url, placeholder, … }] }.
 * Para los jobs `done` con imagen, una URL firmada de Storage (10 min). `provider` permite a la interfaz etiquetar la
 * vista previa del modo de prueba (dry-run).
 */
export async function GET(req: Request) {
  const ctx = generationContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: 503 });
  const bookId = new URL(req.url).searchParams.get("bookId");
  try {
    const r = await jobStatus(ctx.store, bookId);
    if (!r.ok) return NextResponse.json(r, { status: r.status });
    return NextResponse.json({ ...r, provider: ctx.adapter.name }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[generate/status]", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "db" }, { status: 500 });
  }
}

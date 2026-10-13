import "server-only";
import { after, NextResponse } from "next/server";
import { paintAll, type PaintOutcome } from "@/lib/book/background";
import { generationContext } from "@/lib/generation/server";
import type { GenerationAdapter } from "@/lib/generation/adapter";
import type { GenStore } from "@/lib/generation/store";
import type { Fail } from "@/lib/generation/service";

/** Cuerpo JSON acotado; null si no es JSON o es demasiado grande. */
export async function readJson(req: Request, max = 120_000): Promise<Record<string, unknown> | null> {
  const raw = await req.text().catch(() => "");
  if (!raw || raw.length > max) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Ejecuta `fn` con almacén y adaptador; traduce Fail a su código HTTP y los errores a 500 sin detalles. */
export async function withContext<T extends { ok: true } | Fail>(tag: string, fn: (store: GenStore, adapter: GenerationAdapter) => Promise<T>): Promise<NextResponse> {
  const ctx = generationContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: 503 });
  try {
    const r = await fn(ctx.store, ctx.adapter);
    return NextResponse.json(r, { status: r.ok ? 200 : (r as Fail).status, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(`[libro/${tag}]`, e instanceof Error ? e.message.slice(0, 200) : "error");
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }
}

export const bad = (error = "json") => NextResponse.json({ ok: false, error }, { status: 400 });

/** Pintar en segundo plano (B5); BACKGROUND_PAINT=0 lo apaga y entonces solo pinta el navegador. */
export const backgroundPaint = () => process.env.BACKGROUND_PAINT !== "0";

/**
 * Pinta con `after()` después de responder: la hoja, la portada o las páginas se terminan aunque el padre cierre la
 * pestaña. El navegador, si sigue abierto, pide los mismos jobs y el bloqueo optimista evita pintarlos dos veces.
 * Para con margen antes del maxDuration de la ruta (si Vercel corta a mitad, el job se queda «pintando» 5 minutos).
 */
export function paintLater(
  tag: string,
  store: GenStore,
  adapter: GenerationAdapter,
  ids: string[] | (() => Promise<string[]>),
  { t0, maxDurationS, concurrency = 3, then }: { t0: number; maxDurationS: number; concurrency?: number; then?: (out: Record<string, PaintOutcome>) => Promise<unknown> },
): void {
  if (!backgroundPaint()) return;
  after(async () => {
    try {
      const list = typeof ids === "function" ? await ids() : ids;
      if (list.length === 0) return;
      const out = await paintAll(store, adapter, list, { concurrency, deadline: t0 + (maxDurationS - 75) * 1000 });
      const count = (o: PaintOutcome) => Object.values(out).filter((x) => x === o).length;
      console.log(`[libro/${tag}] segundo plano: ${count("done")} hechas, ${count("failed")} fallidas, ${count("timeout")} sin tiempo, ${count("budget")} sin presupuesto`);
      await then?.(out);
    } catch (e) {
      console.error(`[libro/${tag}] segundo plano`, e instanceof Error ? e.message.slice(0, 200) : "error");
    }
  });
}

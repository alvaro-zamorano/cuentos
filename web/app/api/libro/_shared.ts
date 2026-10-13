import "server-only";
import { NextResponse } from "next/server";
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

import "server-only";
import { NextResponse } from "next/server";
import { selectLlm, type Llm } from "@/lib/llm";
import { EVAL_CASES } from "@/lib/plan/evalCases";
import { planBook } from "@/lib/plan/planner";

/**
 * Pruebas internas en las previews (B1). En producción no existe (404). La preview está detrás de la protección de
 * Vercel, así que no es pública. Nunca devuelve claves.
 *
 *   GET /api/dev?task=models               ids de los modelos de Anthropic disponibles para la clave
 *   GET /api/dev?task=plan&case=1..10      planificador con una ficha de lib/plan/evalCases.ts (de pago: ~5 c)
 *        &model=claude-…                   otro modelo para comparar (solo ids claude-* o gpt-*)
 */
export const maxDuration = 300;

function withModel(llm: Llm, model: string | null): Llm {
  if (!model || !/^(claude|gpt)-[a-z0-9.-]{2,60}$/.test(model)) return llm;
  const env = { ...process.env, PLAN_MODEL: model };
  return selectLlm("plan", env);
}

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV === "production") return NextResponse.json({ ok: false }, { status: 404 });
  const url = new URL(req.url);
  const task = url.searchParams.get("task");

  if (task === "models") {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (!key) return NextResponse.json({ ok: false, error: "sin clave" });
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, cache: "no-store" });
    const json = (await res.json().catch(() => null)) as { data?: { id: string; created_at?: string }[] } | null;
    return NextResponse.json({ ok: res.ok, status: res.status, models: (json?.data ?? []).map((m) => ({ id: m.id, created: m.created_at })) });
  }

  if (task === "plan") {
    const i = Number(url.searchParams.get("case")) - 1;
    const ficha = EVAL_CASES[i];
    if (!ficha) return NextResponse.json({ ok: false, error: "case 1..10" }, { status: 400 });
    const llm = withModel(selectLlm("plan"), url.searchParams.get("model"));
    const r = await planBook(ficha, llm);
    if (!r.ok) return NextResponse.json({ case: i + 1, ...r });
    const p = r.record.plan;
    return NextResponse.json({
      case: i + 1,
      ok: true,
      model: r.record.model,
      ms: r.ms,
      attempts: r.attempts,
      usage: r.usage,
      costCents: r.costCents,
      warnings: r.warnings,
      title: p.title,
      dedication: p.dedication,
      tone: p.tone,
      notices: p.notices,
      extraCast: p.extraCast,
      places: p.places,
      objects: p.objects,
      cover: p.cover,
      pages: p.pages,
    });
  }

  return NextResponse.json({ ok: false, error: "task=models|plan" }, { status: 400 });
}

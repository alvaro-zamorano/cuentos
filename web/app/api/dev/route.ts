import "server-only";
import { NextResponse } from "next/server";
import { selectLlm, type Llm } from "@/lib/llm";
import { EVAL_CASES } from "@/lib/plan/evalCases";
import { bookView, payDryRun, requestPages, reviseSheet, startBook } from "@/lib/book/service";
import { dryRunAdapter, geminiImagesAdapter } from "@/lib/generation/adapter";
import { runJob } from "@/lib/generation/service";
import { supabaseStore } from "@/lib/generation/store";
import { normalizeFicha } from "@/lib/plan/ficha";
import { supabaseAdmin } from "@/lib/supabase/server";
import { planBook } from "@/lib/plan/planner";
import { plannerSystem, plannerUser } from "@/lib/plan/prompt";

/**
 * Pruebas internas en las previews (B1). En producción no existe (404). La preview está detrás de la protección de
 * Vercel, así que no es pública. Nunca devuelve claves.
 *
 *   GET /api/dev?task=models               ids de los modelos de Anthropic disponibles para la clave
 *   GET /api/dev?task=plan&case=1..10      planificador con una ficha de lib/plan/evalCases.ts (de pago: ~5 c)
 *        &model=claude-…                   otro modelo para comparar (solo ids claude-* o gpt-*)
 *   GET /api/dev?task=b3start&case=N       plan + hoja y portada encoladas con Gemini (email prueba-b3-N@cuentos.test)
 *   GET /api/dev?task=run&job=<id>         pinta un job con Gemini (de pago: 4–6 c), con control de calidad
 *   GET /api/dev?task=view&b=<id>          estado, URLs firmadas, coste y control de calidad de cada job
 *   GET /api/dev?task=revise&b=<id>&ask=…  cambio de la hoja con palabras
 *   GET /api/dev?task=pages&b=<id>[&page=] pago de prueba + páginas encoladas (o otra versión de una)
 * Gemini aquí no depende de GENERATION_PROVIDER: así se prueba sin activar el gasto en la interfaz.
 */
export const maxDuration = 300;

function withModel(llm: Llm, model: string | null, url?: URL): Llm {
  const thinking = url?.searchParams.get("thinking");
  const effort = url?.searchParams.get("effort");
  if ((!model || !/^(claude|gpt)-[a-z0-9.-]{2,60}$/.test(model)) && !thinking && !effort) return llm;
  const env: Record<string, string | undefined> = { ...process.env };
  if (model && /^(claude|gpt)-[a-z0-9.-]{2,60}$/.test(model)) env.PLAN_MODEL = model;
  if (thinking) env.PLAN_THINKING = thinking;
  if (effort) env.PLAN_EFFORT = effort;
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

  if (task === "ping") {
    // diagnóstico de un modelo: una llamada mínima (≈ 0,01 c) con y sin temperature
    const model = url.searchParams.get("model") ?? "";
    if (!/^claude-[a-z0-9.-]{2,60}$/.test(model)) return NextResponse.json({ ok: false, error: "model" }, { status: 400 });
    const llm = selectLlm("plan", { ...process.env, PLAN_MODEL: model });
    const out: Record<string, unknown> = {};
    for (const temperature of [undefined, 0.8]) {
      try {
        const r = await llm.complete({ system: "Responde solo: ok", messages: [{ role: "user", content: "di ok" }], maxTokens: 5, temperature });
        out[`temp_${temperature ?? "none"}`] = { ok: true, ms: r.ms, model: r.model };
      } catch (e) {
        out[`temp_${temperature ?? "none"}`] = { ok: false, error: e instanceof Error ? e.message : "error" };
      }
    }
    return NextResponse.json(out);
  }

  if (task === "raw") {
    // una sola llamada del planificador, sin validar: tiempo, tokens, motivo de parada y el principio y el final del texto
    const i = Number(url.searchParams.get("case")) - 1;
    const ficha = EVAL_CASES[i];
    if (!ficha) return NextResponse.json({ ok: false, error: "case 1..10" }, { status: 400 });
    const llm = withModel(selectLlm("plan"), url.searchParams.get("model"), url);
    const maxTokens = Math.min(16000, Number(url.searchParams.get("max")) || 6000);
    try {
      const r = await llm.complete({ system: plannerSystem(), messages: [{ role: "user", content: plannerUser(normalizeFicha(ficha)) }], maxTokens });
      return NextResponse.json({ ok: true, model: r.model, ms: r.ms, stop: r.stop, usage: r.usage, blocks: r.blocks, length: r.raw.length, head: r.raw.slice(0, 600), tail: r.raw.slice(-300) });
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" });
    }
  }

  if (task === "plan") {
    const i = Number(url.searchParams.get("case")) - 1;
    const ficha = EVAL_CASES[i];
    if (!ficha) return NextResponse.json({ ok: false, error: "case 1..10" }, { status: 400 });
    const llm = withModel(selectLlm("plan"), url.searchParams.get("model"), url);
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
      firstIssues: r.firstIssues,
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

  /* ---------- B3 de verdad (Gemini) sin depender de GENERATION_PROVIDER: hoja + portada de una ficha de prueba ---------- */
  if (task === "b3start" || task === "run" || task === "view" || task === "revise" || task === "pages") {
    const db = supabaseAdmin();
    if (!db) return NextResponse.json({ ok: false, error: "sin supabase" }, { status: 503 });
    const store = supabaseStore(db);
    const adapter = url.searchParams.get("provider") === "dry-run" ? dryRunAdapter : geminiImagesAdapter;
    if (task === "b3start") {
      const i = Number(url.searchParams.get("case")) - 1;
      const ficha = EVAL_CASES[i];
      if (!ficha) return NextResponse.json({ ok: false, error: "case 1..10" }, { status: 400 });
      const plan = await planBook(ficha, selectLlm("plan"));
      if (!plan.ok) return NextResponse.json(plan);
      const r = await startBook(store, { email: `prueba-b3-${i + 1}@cuentos.test`, ficha, plan: plan.record.plan, planMeta: { provider: plan.record.provider, model: plan.record.model } }, adapter);
      return NextResponse.json({ ...r, planMs: plan.ms, planCents: plan.costCents, title: plan.record.plan.title });
    }
    if (task === "run") {
      const r = await runJob(store, url.searchParams.get("job"), adapter);
      return NextResponse.json(r.ok ? { ok: true, ran: r.ran, status: r.job.status, error: r.job.error, cost: r.job.cost_cents, candidates: r.job.candidates } : r);
    }
    if (url.searchParams.get("again") === "1" && task === "view") {
      // repetir el paso 4 con lo guardado: reabre la hoja y la portada si fallaron
      const v = await bookView(store, url.searchParams.get("b"));
      const book = v.ok ? await store.findBook({ publicId: v.bookId }) : null;
      if (!v.ok || !book) return NextResponse.json(v);
      return NextResponse.json(await startBook(store, { bookId: v.bookId, email: book.email, ficha: v.ficha, plan: v.plan }, adapter));
    }
    if (task === "revise") {
      return NextResponse.json(await reviseSheet(store, { bookId: url.searchParams.get("b"), instruction: url.searchParams.get("ask") }, adapter));
    }
    if (task === "pages") {
      const b = url.searchParams.get("b");
      const book = b ? await store.findBook({ publicId: b }) : null;
      if (book && !(await store.hasPaidOrder(book.id))) await payDryRun(store, { bookId: b });
      return NextResponse.json(await requestPages(store, { bookId: b, page: url.searchParams.get("page") ?? undefined }, adapter, { dryRunPayment: false }));
    }
    const v = await bookView(store, url.searchParams.get("b"));
    if (!v.ok) return NextResponse.json(v);
    const book = await store.findBook({ publicId: v.bookId });
    const raw = book ? await store.listJobs(book.id) : [];
    const draft = book?.raw as { castArt?: unknown } | undefined;
    return NextResponse.json({
      ok: true,
      bookId: v.bookId,
      title: v.plan.title,
      castArt: draft?.castArt,
      chosen: v.chosen,
      jobs: v.jobs.map((j) => {
        const r = raw.find((x) => x.id === j.id);
        return { id: j.id, kind: j.kind, page: j.page, variant: j.variant, status: j.status, url: j.url, cost: r?.cost_cents, error: r?.error, candidates: r?.candidates, prompt: url.searchParams.get("prompts") ? r?.prompt : undefined };
      }),
    });
  }

  return NextResponse.json({ ok: false, error: "task=models|ping|raw|plan|b3start|run|view|revise|pages" }, { status: 400 });
}

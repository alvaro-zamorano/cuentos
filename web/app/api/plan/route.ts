import "server-only";
import { NextResponse } from "next/server";
import { selectLlm } from "@/lib/llm";
import { fichaHash, normalizeFicha } from "@/lib/plan/ficha";
import { planBook } from "@/lib/plan/planner";
import { TEXT_BUDGET_MESSAGE, recordText, textRoom } from "@/lib/plan/textBudget";
import type { PlanRecord } from "@/lib/plan/types";
import { clientIp, envInt, rateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

/**
 * POST /api/plan { ficha } → { record, warnings } (paso 3: el cuento escrito en 12 tarjetas).
 * Con Supabase guarda cada plan en cuentos_stories (input_hash = huella de la ficha) y reutiliza el último plan válido
 * de esa huella: volver atrás y adelante no paga dos veces. «Escribirlo de otra manera» cambia la semilla de la ficha.
 * Límite: PLAN_RATE_PER_HOUR por IP (12 por defecto) y el tope diario de gasto, que también cuenta el texto (I6).
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: { ficha?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  if (!body.ficha || typeof body.ficha !== "object") return NextResponse.json({ ok: false, error: "ficha" }, { status: 400 });
  const ficha = normalizeFicha(body.ficha);
  const hash = fichaHash(ficha);
  const llm = selectLlm("plan");
  const db = supabaseAdmin();

  if (db) {
    try {
      const { data } = await db
        .from("cuentos_stories")
        .select("story")
        .eq("input_hash", `plan:${hash}`)
        .eq("provider", llm.name)
        .eq("fallback", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const cached = data?.story as unknown as PlanRecord | undefined;
      if (cached?.fichaHash === hash && cached.plan?.pages?.length === 12) {
        return NextResponse.json({ ok: true, record: cached, warnings: [], cached: true });
      }
    } catch {
      // sin caché: se escribe
    }
  }

  const limit = rateLimit(`plan:${clientIp(req)}`, envInt("PLAN_RATE_PER_HOUR", 12));
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited", message: "Has pedido muchos cuentos seguidos. Espera un poco y vuelve a intentarlo." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const room = await textRoom(db, "plan", llm);
  if (!room.ok) {
    console.warn(`[plan] sin presupuesto: ${room.reason}`);
    return NextResponse.json({ ok: false, error: "budget", message: TEXT_BUDGET_MESSAGE }, { status: 503 });
  }
  const result = await planBook(ficha, llm);
  // también si falla después de llamar al modelo (negativa, plan no válido): ese gasto existe (revisión 26 oct)
  if (result.ok || result.costCents) await recordText(db, "plan", llm, result.costCents ?? null);
  if (!result.ok) return NextResponse.json({ ...result, costCents: undefined }, { status: result.status });

  if (db) {
    const { error } = await db.from("cuentos_stories").insert({
      input_hash: `plan:${hash}`,
      input: ficha as unknown as Json,
      story: result.record as unknown as Json,
      provider: result.record.provider,
      model: result.record.model,
      usage: { ...result.usage, ms: result.ms, attempts: result.attempts } as unknown as Json,
      cost_cents: Math.ceil(result.costCents ?? 0),
      fallback: false,
      issues: result.warnings as unknown as Json,
    });
    if (error) console.error("[plan] supabase", error.code);
  }

  return NextResponse.json({ ok: true, record: result.record, warnings: result.warnings, cached: false, ms: result.ms });
}

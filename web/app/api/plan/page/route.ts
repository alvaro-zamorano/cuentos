import "server-only";
import { NextResponse } from "next/server";
import { selectLlm } from "@/lib/llm";
import { rewritePage } from "@/lib/plan/planner";
import { TEXT_BUDGET_MESSAGE, recordText, textRoom } from "@/lib/plan/textBudget";
import { clientIp, envInt, rateLimit } from "@/lib/rateLimit";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * POST /api/plan/page { ficha, plan, n, instruction } → { page } (paso 3: «cambia esta página con una frase»).
 * Solo devuelve la página nueva; el cliente la sustituye en su plan. Límite: PAGE_RATE_PER_HOUR por IP (40) y el
 * tope diario de gasto, que también cuenta el texto (I6).
 */
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { ficha?: unknown; plan?: unknown; n?: unknown; instruction?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  if (JSON.stringify(body).length > 80_000) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  const limit = rateLimit(`page:${clientIp(req)}`, envInt("PAGE_RATE_PER_HOUR", 40), 0);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited", message: "Demasiados cambios seguidos. Espera un poco." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const llm = selectLlm("plan");
  const db = supabaseAdmin();
  const room = await textRoom(db, "page", llm);
  if (!room.ok) {
    console.warn(`[plan/page] sin presupuesto: ${room.reason}`);
    return NextResponse.json({ ok: false, error: "budget", message: TEXT_BUDGET_MESSAGE }, { status: 503 });
  }
  const result = await rewritePage(body.ficha, body.plan, body.n, body.instruction, llm);
  if (result.ok) await recordText(db, "page", llm, result.costCents);
  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}

import "server-only";
import { NextResponse } from "next/server";
import { rewritePage } from "@/lib/plan/planner";
import { clientIp, envInt, rateLimit } from "@/lib/rateLimit";

/**
 * POST /api/plan/page { ficha, plan, n, instruction } → { page } (paso 3: «cambia esta página con una frase»).
 * Solo devuelve la página nueva; el cliente la sustituye en su plan. Límite: PAGE_RATE_PER_HOUR por IP (40).
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
  const limit = rateLimit(`page:${clientIp(req)}`, envInt("PAGE_RATE_PER_HOUR", 40));
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited", message: "Demasiados cambios seguidos. Espera un poco." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });
  const result = await rewritePage(body.ficha, body.plan, body.n, body.instruction);
  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}

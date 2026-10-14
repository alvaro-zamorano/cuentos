import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalizeDraft } from "@/lib/story";
import { generateStory } from "@/lib/story/generate";
import { selectProvider } from "@/lib/story/provider";
import { storyInputFromDraft } from "@/lib/story/spec";
import type { Json } from "@/lib/supabase/types";
import type { Draft, Story } from "@/lib/types";

/**
 * POST /api/story { draft } → { story, provider, model, fallback, validation }.
 * Escribe las 12 páginas con el proveedor de STORY_PROVIDER (mock si no hay clave). Solo servidor: las claves
 * no salen de aquí y no se registran ni la clave ni el prompt.
 * Límite por IP (memoria del proceso): 1 petición por segundo y STORY_RATE_PER_HOUR por hora (20 por defecto).
 * Con Supabase: antes de generar busca en cuentos_stories por input_hash y proveedor; después guarda el resultado.
 */

const hits = new Map<string, number[]>();
const HOUR = 3_600_000;

function rateLimit(ip: string): { ok: true } | { ok: false; retryAfter: number } {
  const perHour = Math.max(1, Number(process.env.STORY_RATE_PER_HOUR) || 20);
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < HOUR);
  const last = list[list.length - 1];
  if (last !== undefined && now - last < 1000) return { ok: false, retryAfter: 1 };
  if (list.length >= perHour) return { ok: false, retryAfter: Math.ceil((HOUR - (now - list[0])) / 1000) };
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > HOUR) hits.delete(k);
  }
  return { ok: true };
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "local";
}

export async function POST(req: Request) {
  let body: { draft?: Partial<Draft> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  if (!body.draft || typeof body.draft !== "object" || !body.draft.hero) return NextResponse.json({ ok: false, error: "draft" }, { status: 400 });

  const limit = rateLimit(clientIp(req));
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  // el cliente no decide nada más que las entradas: la historia previa y los textos editados no se envían al proveedor
  const draft = normalizeDraft({ ...body.draft, story: undefined, textOverrides: {} });
  const input = storyInputFromDraft(draft);
  const { provider, requested } = selectProvider();
  const db = supabaseAdmin();

  if (db) {
    try {
      const { data } = await db
        .from("cuentos_stories")
        .select("story, provider, model")
        .eq("input_hash", input.inputHash)
        .eq("provider", provider.name)
        .eq("fallback", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const cached = data?.story as unknown as Story | undefined;
      if (cached && cached.inputHash === input.inputHash && Array.isArray(cached.pages) && cached.pages.length === 12) {
        return NextResponse.json({
          ok: true,
          story: cached,
          provider: data!.provider,
          requestedProvider: requested,
          model: data!.model,
          fallback: false,
          validation: { ok: true, issues: [] },
          cached: true,
        });
      }
    } catch {
      // sin caché: se genera
    }
  }

  const result = await generateStory(draft, provider);

  if (db) {
    const { error } = await db.from("cuentos_stories").insert({
      input_hash: input.inputHash,
      input: input as unknown as Json,
      story: result.story as unknown as Json,
      provider: result.provider,
      model: result.model,
      usage: result.usage as unknown as Json,
      cost_cents: result.costCents,
      fallback: result.fallback,
      issues: result.validation.issues as unknown as Json,
    });
    if (error) console.error("[story] supabase", error.code, error.message);
  }

  return NextResponse.json({
    ok: true,
    story: result.story,
    provider: result.provider,
    requestedProvider: requested,
    model: result.model,
    fallback: result.fallback,
    validation: result.validation,
    attempts: result.attempts,
    costCents: result.costCents,
    costEstimated: result.costEstimated,
    cached: false,
  });
}

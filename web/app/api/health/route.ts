import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { serviceRoleKey } from "@/lib/supabase/admin";
import { selectProvider } from "@/lib/story/provider";
import { geminiModel } from "@/lib/generation/adapter";

/**
 * GET /api/health — qué configuración tiene este despliegue. Nunca devuelve valores, solo si existen.
 * GET /api/health?deep=1 — además comprueba cada clave con una llamada gratuita (sin generar nada):
 *   Supabase: un count sobre cuentos_books · Anthropic: ficha del modelo configurado · Gemini: ficha del modelo de imagen.
 * Respuesta de cada comprobación: "ok", el código HTTP del proveedor o "error".
 */
type Check = "ok" | "skipped" | "error" | number | { status: number; type?: string; message?: string };

const has = (k: string) => Boolean(process.env[k]?.trim());

async function status(url: string, headers: Record<string, string>): Promise<Check> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (res.ok) return "ok";
    // tipo y mensaje del error del proveedor (nunca incluyen la clave), recortados
    const body = (await res.json().catch(() => null)) as { error?: { type?: string; status?: string; message?: string } } | null;
    const e = body?.error;
    return { status: res.status, type: e?.type ?? e?.status, message: e?.message?.slice(0, 200) };
  } catch {
    return "error";
  }
}

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const { provider, requested } = selectProvider();
  const storyModel = process.env.STORY_MODEL || (provider.name === "anthropic" ? "claude-sonnet-4-5" : provider.name === "openai" ? "gpt-4.1-mini" : "mock");
  const imageProvider = process.env.GENERATION_PROVIDER || "dry-run";
  // la clave de Anthropic se comprueba aunque STORY_PROVIDER no la active todavía
  const anthropicModel = provider.name === "anthropic" ? storyModel : process.env.STORY_MODEL || "claude-sonnet-4-5";
  const out = {
    supabase: {
      url: has("NEXT_PUBLIC_SUPABASE_URL"),
      serviceRole: Boolean(serviceRoleKey()),
      // solo NOMBRES de variables parecidas (nunca valores), para detectar erratas en Vercel
      similarNames: Object.keys(process.env).filter((k) => /supabase|service|role/i.test(k) && k !== "NEXT_PUBLIC_SUPABASE_URL").sort(),
      check: "skipped" as Check,
    },
    story: { requested, active: provider.name, model: storyModel, anthropicKey: has("ANTHROPIC_API_KEY"), openaiKey: has("OPENAI_API_KEY"), check: "skipped" as Check },
    anthropic: { model: anthropicModel, check: "skipped" as Check },
    images: { provider: imageProvider, geminiKey: has("GEMINI_API_KEY"), geminiModel: geminiModel(), check: "skipped" as Check },
  };

  if (deep) {
    const db = supabaseAdmin();
    const checks: Promise<void>[] = [];
    if (db) {
      checks.push(
        (async () => {
          const { error } = await db.from("cuentos_books").select("public_id", { count: "exact", head: true });
          out.supabase.check = error ? "error" : "ok";
        })(),
      );
    }
    const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (anthropicKey) {
      checks.push(
        status(`https://api.anthropic.com/v1/models/${encodeURIComponent(anthropicModel)}`, { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" }).then((c) => {
          out.anthropic.check = c;
          if (provider.name === "anthropic") out.story.check = c;
        }),
      );
    }
    const geminiKey = process.env.GEMINI_API_KEY?.trim();
    if (geminiKey) {
      checks.push(
        status(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel())}`, { "x-goog-api-key": geminiKey }).then((c) => {
          out.images.check = c;
        }),
      );
    }
    await Promise.all(checks);
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}

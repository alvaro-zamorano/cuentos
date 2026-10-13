import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { selectProvider } from "@/lib/story/provider";
import { geminiModel } from "@/lib/generation/adapter";

/**
 * GET /api/health — qué configuración tiene este despliegue. Nunca devuelve valores, solo si existen.
 * GET /api/health?deep=1 — además comprueba cada clave con una llamada gratuita (sin generar nada):
 *   Supabase: un count sobre cuentos_books · Anthropic: ficha del modelo configurado · Gemini: ficha del modelo de imagen.
 * Respuesta de cada comprobación: "ok", el código HTTP del proveedor o "error".
 */
type Check = "ok" | "skipped" | "error" | number;

const has = (k: string) => Boolean(process.env[k]?.trim());

async function status(url: string, headers: Record<string, string>): Promise<Check> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000), cache: "no-store" });
    return res.ok ? "ok" : res.status;
  } catch {
    return "error";
  }
}

export async function GET(req: Request) {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const { provider, requested } = selectProvider();
  const storyModel = process.env.STORY_MODEL || (provider.name === "anthropic" ? "claude-sonnet-4-5" : provider.name === "openai" ? "gpt-4.1-mini" : "mock");
  const imageProvider = process.env.GENERATION_PROVIDER || "dry-run";
  const out = {
    supabase: { url: has("NEXT_PUBLIC_SUPABASE_URL"), serviceRole: has("SUPABASE_SERVICE_ROLE_KEY"), check: "skipped" as Check },
    story: { requested, active: provider.name, model: storyModel, anthropicKey: has("ANTHROPIC_API_KEY"), openaiKey: has("OPENAI_API_KEY"), check: "skipped" as Check },
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
    if (anthropicKey && provider.name === "anthropic") {
      checks.push(
        status(`https://api.anthropic.com/v1/models/${encodeURIComponent(storyModel)}`, { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" }).then((c) => {
          out.story.check = c;
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

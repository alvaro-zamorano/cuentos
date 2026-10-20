import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { keyKind, serviceRoleKey } from "@/lib/supabase/admin";
import { DEFAULT_MODEL, selectLlm } from "@/lib/llm";
import { selectProvider } from "@/lib/story/provider";
import { geminiModel, providerName } from "@/lib/generation/adapter";
import { mailEnabled } from "@/lib/mail";
import { forwardTargets, inboundEnabled } from "@/lib/inbound";
import { paymentMode } from "@/lib/stripe";
import { appEnabled } from "@/lib/launch";
import { gelatoOrderType, gelatoPageCount, printMode } from "@/lib/print/gelato";

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
  const url = new URL(req.url);
  // En producción (E11): sin nombres de variables y la comprobación profunda solo con HEALTH_TOKEN.
  const prod = process.env.VERCEL_ENV === "production";
  const token = process.env.HEALTH_TOKEN?.trim();
  const deep = url.searchParams.get("deep") === "1" && (!prod || (!!token && url.searchParams.get("token") === token));
  const { provider, requested } = selectProvider();
  const planLlm = selectLlm("plan");
  const storyModel = planLlm.model;
  // nombre canónico («gemini» y «nano-banana» cuentan como gemini-images); uno desconocido sale tal cual y las rutas dan 503
  const imageProvider = providerName();
  // la clave de Anthropic se comprueba aunque STORY_PROVIDER no la active todavía
  const anthropicModel = planLlm.name === "anthropic" ? planLlm.model : DEFAULT_MODEL.anthropic.plan;
  const out = {
    supabase: {
      url: has("NEXT_PUBLIC_SUPABASE_URL"),
      serviceRole: Boolean(serviceRoleKey()),
      // "secret" o "jwt:service_role" es lo correcto; "publishable"/"jwt:anon" = se pegó la clave pública
      serviceRoleKind: keyKind(serviceRoleKey()),
      // solo NOMBRES de variables parecidas (nunca valores), para detectar erratas en Vercel
      similarNames: prod ? [] : Object.keys(process.env).filter((k) => /supabase|service|role/i.test(k) && k !== "NEXT_PUBLIC_SUPABASE_URL").sort(),
      check: "skipped" as Check,
    },
    story: { requested, active: provider.name, model: storyModel, artModel: selectLlm("art").model, qcModel: selectLlm("qc").model, anthropicKey: has("ANTHROPIC_API_KEY"), openaiKey: has("OPENAI_API_KEY"), check: "skipped" as Check },
    anthropic: { model: anthropicModel, check: "skipped" as Check },
    images: { provider: imageProvider, geminiKey: has("GEMINI_API_KEY"), geminiModel: geminiModel(), check: "skipped" as Check },
    // interruptor de la app (lib/launch.ts): cerrada en producción salvo APP_ENABLED=1
    app: { enabled: appEnabled(), variable: process.env.APP_ENABLED ?? null },
    // mode: "stripe" con STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET; "dry-run" nunca en producción
    payment: { mode: paymentMode(), dryRun: process.env.NEXT_PUBLIC_DRY_RUN_PAYMENT === "1", stripeKey: has("STRIPE_SECRET_KEY"), stripeWebhookSecret: has("STRIPE_WEBHOOK_SECRET") },
    mail: { enabled: mailEnabled(), resendKey: has("RESEND_API_KEY"), from: has("MAIL_FROM"), siteUrl: has("SITE_URL") },
    // correo entrante: reenvío de hola@ (lib/inbound.ts). receivingCheck: la clave de Resend puede leer correos recibidos
    inbound: { enabled: inboundEnabled(), webhookSecret: has("RESEND_WEBHOOK_SECRET"), forwardTo: forwardTargets().length > 0, receivingCheck: "skipped" as Check },
    background: process.env.BACKGROUND_PAINT !== "0",
    cron: { secret: has("CRON_SECRET") },
    // libro impreso (B8): "gelato" con clave; fuera de producción los pedidos son borradores salvo GELATO_ORDER_TYPE=order
    print: { mode: printMode(), orderType: gelatoOrderType(), pageCount: gelatoPageCount(), apiKey: has("GELATO_API_KEY"), productUid: has("GELATO_PRODUCT_UID"), webhookSecret: has("GELATO_WEBHOOK_SECRET") },
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
    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (resendKey) {
      // lista vacía o no, solo importa el código: 401/403 = la clave solo puede enviar
      checks.push(
        status("https://api.resend.com/emails/receiving?limit=1", { authorization: `Bearer ${resendKey}` }).then((c) => {
          out.inbound.receivingCheck = c;
        }),
      );
    }
    await Promise.all(checks);
  }

  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}

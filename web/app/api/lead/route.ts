import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { EMAIL_RE, asEdition } from "@/lib/validate";

/**
 * Captura de email (lead magnet).
 * - Upsert en cuentos_leads (email + edición únicos) si hay Supabase configurado.
 * - Además, si existe LEADS_WEBHOOK_URL, reenvía el lead (Buttondown/Resend/Make…).
 * Nunca bloquea la descarga: si falla la persistencia responde ok con stored=false.
 */
export async function POST(req: Request) {
  let body: { email?: string; marketing?: boolean; edition?: string; consent?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "email" }, { status: 400 });
  if (!body.consent) return NextResponse.json({ ok: false, error: "consent" }, { status: 400 });

  const lead = { email, marketing: !!body.marketing, edition: asEdition(body.edition), source: "cuentos-web" };

  let stored = false;
  const db = supabaseAdmin();
  if (db) {
    const { error } = await db.from("cuentos_leads").upsert(lead, { onConflict: "email,edition" });
    stored = !error;
    if (error) console.error("[lead] supabase", error.code, error.message);
  }

  const webhook = process.env.LEADS_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lead, at: new Date().toISOString() }),
      });
      stored = true;
    } catch {
      // no bloqueamos la descarga por un fallo del webhook
    }
  }
  return NextResponse.json({ ok: true, stored });
}

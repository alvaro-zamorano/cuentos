import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { EMAIL_RE } from "@/lib/validate";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { STARTERS } from "@/lib/plan/starters";

/**
 * Lista de espera (20 oct): mientras la app está cerrada en producción (lib/launch.ts). Guarda el email en
 * cuentos_leads con marketing = true (la casilla obligatoria es justo el aviso y las novedades) y origen
 * «lista-espera» o «lista-espera:<idea>». Así el borrado a 30 días no lo toca (solo borra los que no aceptaron).
 */
export async function POST(req: Request) {
  const limit = rateLimit(`lista:${clientIp(req)}`, 20, 0);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate" }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  let body: { email?: unknown; consent?: unknown; idea?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "json" }, { status: 400 });
  }
  // trampa para bots: un campo oculto que una persona no rellena
  if (typeof body.website === "string" && body.website.trim()) return NextResponse.json({ ok: true });

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 200) return NextResponse.json({ ok: false, error: "email" }, { status: 400 });
  if (body.consent !== true) return NextResponse.json({ ok: false, error: "consent" }, { status: 400 });
  const idea = typeof body.idea === "string" && STARTERS.some((s) => s.id === body.idea) ? body.idea : null;

  const db = supabaseAdmin();
  if (!db) {
    // en local y en pruebas sin Supabase se da por buena; en producción, sin base no se puede prometer el aviso
    if (process.env.VERCEL_ENV === "production") return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503 });
    return NextResponse.json({ ok: true, stored: false });
  }
  const { error } = await db
    .from("cuentos_leads")
    .upsert({ email, marketing: true, edition: "hardcover", source: idea ? `lista-espera:${idea}` : "lista-espera" }, { onConflict: "email,edition" });
  if (error) {
    console.error("[lista] supabase", error.code, error.message);
    return NextResponse.json({ ok: false, error: "db" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, stored: true });
}

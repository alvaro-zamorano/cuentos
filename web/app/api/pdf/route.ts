import { NextResponse } from "next/server";
import { renderBookPdf } from "@/lib/pdf/render";
import { normalizeDraft } from "@/lib/story";
import type { Draft } from "@/lib/types";

export const maxDuration = 60;

/**
 * POST /api/pdf { draft, edition } → application/pdf (13 hojas A4 apaisadas).
 * El borrador viaja en el cuerpo (no hace falta Supabase): el servidor abre /libro con él y pide el PDF a Chromium.
 * Límite: 1 por segundo y 10 por minuto por IP (en memoria del proceso).
 */
const MAX_BODY = 200_000;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  hits.set(ip, arr);
  if (arr.length >= 10 || (arr.length && now - arr[arr.length - 1] < 1_000)) return true;
  arr.push(now);
  return false;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too_large" }, { status: 413 });
  let body: { draft?: Partial<Draft>; edition?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  if (!body.draft || typeof body.draft !== "object") return NextResponse.json({ error: "draft_required" }, { status: 400 });
  const draft = normalizeDraft(body.draft);
  if (!draft.hero.name.trim()) return NextResponse.json({ error: "name_required" }, { status: 400 });
  const edition = body.edition === "illustrated" ? "illustrated" : "classic";
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!host) return NextResponse.json({ error: "no_host" }, { status: 400 });
  const origin = `${proto}://${host}`;
  try {
    const pdf = await renderBookPdf({ draft, edition, origin });
    const name = draft.hero.name
      .trim()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    const filename = `cuento-${name || "libro"}${edition === "illustrated" ? "-ilustrado" : ""}.pdf`;
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    console.error("[pdf]", msg.slice(0, 200));
    return NextResponse.json({ error: msg === "no_chromium" ? "no_chromium" : "render_failed" }, { status: 503 });
  }
}

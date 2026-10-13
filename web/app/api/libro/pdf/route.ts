import { NextResponse } from "next/server";
import { bookView } from "@/lib/book/service";
import { generationContext } from "@/lib/generation/server";
import { renderBook2Pdf } from "@/lib/pdf/book2";
import { clientIp, rateLimit } from "@/lib/rateLimit";

/**
 * GET /api/libro/pdf?b=<bookId>&kind=free|full → application/pdf (A4 vertical, D5).
 * free (D3): portada ilustrada + texto, disponible tras el email. full: con las 12 ilustraciones, tras el pago y con
 * todas las páginas pintadas. Límite: 6 por hora y IP.
 */
export const maxDuration = 120;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "full" ? "full" : "free";
  const limit = rateLimit(`pdf2:${clientIp(req)}`, 6);
  if (!limit.ok) return NextResponse.json({ ok: false, error: "rate_limited" }, { status: 429 });
  const ctx = generationContext();
  if ("error" in ctx) return NextResponse.json({ ok: false, error: ctx.error }, { status: 503 });
  const view = await bookView(ctx.store, url.searchParams.get("b"));
  if (!view.ok) return NextResponse.json(view, { status: view.status });
  const byId = new Map(view.jobs.map((j) => [j.id, j]));
  const coverUrl = view.chosen.cover ? byId.get(view.chosen.cover)?.url ?? null : null;
  const pageUrls: Record<number, string | null> = {};
  for (let n = 1; n <= 12; n++) pageUrls[n] = view.chosen.pages[n] ? byId.get(view.chosen.pages[n]!)?.url ?? null : null;
  if (kind === "full") {
    if (!view.paid) return NextResponse.json({ ok: false, error: "not_paid" }, { status: 402 });
    const missing = Object.entries(pageUrls).filter(([, u]) => !u).map(([n]) => Number(n));
    if (missing.length) return NextResponse.json({ ok: false, error: "pages_missing", pages: missing }, { status: 409 });
  }
  try {
    const pdf = await renderBook2Pdf({ plan: view.plan, heroName: view.ficha.hero.name, from: view.ficha.from, coverUrl, pageUrls, kind });
    const slug = view.ficha.hero.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "libro";
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="cuento-${slug}${kind === "full" ? "-ilustrado" : ""}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[libro/pdf]", e instanceof Error ? e.message.slice(0, 200) : "error");
    return NextResponse.json({ ok: false, error: "render_failed" }, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { bookPdf, pdfErrorMessage, type PdfKind, type PdfResult } from "@/lib/book/pdf";
import { generationContext } from "@/lib/generation/server";
import { renderBook2Pdf } from "@/lib/pdf/book2";
import { clientIp, rateLimit } from "@/lib/rateLimit";

/**
 * El PDF del libro (A4 apaisado, como el impreso). free (D3): portada ilustrada + texto, tras el email. full: con las
 * 12 ilustraciones, tras el pago y con todas las páginas pintadas. Se pinta una vez y se guarda (lib/book/pdf.ts, I10).
 *
 * - POST { bookId, kind } → { ok, url }: lo que usa el botón, que enseña «Preparando el PDF…» y, si falla, un mensaje.
 * - GET ?b=<bookId>&kind=free|full: el enlace directo. Lleva a la URL firmada (o da los bytes) y, si falla, una página en
 *   castellano en vez de un JSON.
 *
 * Límite: 6 PDF pintados por hora y IP (los fallos no cuentan); pedir uno ya hecho, 60.
 */
export const maxDuration = 120;

/** Sin bucket (en memoria, o si no se pudo guardar), el POST deja los bytes aquí un momento para el GET que sigue. */
const handoff = new Map<string, { pdf: Uint8Array; filename: string; until: number }>();

function keep(r: { pdf: Uint8Array; filename: string }): string {
  const now = Date.now();
  for (const [k, v] of handoff) if (v.until < now) handoff.delete(k);
  while (handoff.size >= 4) handoff.delete(handoff.keys().next().value!);
  const token = crypto.randomUUID();
  handoff.set(token, { ...r, until: now + 2 * 60_000 });
  return token;
}

async function make(req: Request, bookId: unknown, kind: PdfKind): Promise<PdfResult> {
  const ip = clientIp(req);
  if (!rateLimit(`pdf:${ip}`, 60, 0).ok) return { ok: false, status: 429, error: "rate_limited", reason: pdfErrorMessage("rate_limited") };
  const ctx = generationContext();
  if ("error" in ctx) return { ok: false, status: 503, error: ctx.error, reason: pdfErrorMessage(ctx.error) };
  return bookPdf(ctx.store, bookId, kind, { render: (input) => renderBook2Pdf(input), allowRender: () => rateLimit(`pdf2:${ip}`, 6) });
}

const kindOf = (v: unknown): PdfKind => (v === "full" ? "full" : "free");

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { bookId?: unknown; kind?: unknown };
  const kind = kindOf(body.kind);
  const r = await make(req, body.bookId, kind);
  if (!r.ok) return NextResponse.json(r, { status: r.status });
  if ("url" in r) return NextResponse.json({ ok: true, url: r.url });
  const b = typeof body.bookId === "string" ? body.bookId : "";
  return NextResponse.json({ ok: true, url: `/api/libro/pdf?b=${encodeURIComponent(b)}&kind=${kind}&t=${keep(r)}` });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = kindOf(url.searchParams.get("kind"));
  const b = url.searchParams.get("b");
  const held = handoff.get(url.searchParams.get("t") ?? "");
  const r: PdfResult = held && held.until > Date.now() ? { ok: true, pdf: held.pdf, filename: held.filename } : await make(req, b, kind);
  if (!r.ok) return errorPage(r.status, r.error, b);
  if ("url" in r) return NextResponse.redirect(r.url, 302);
  return new Response(Buffer.from(r.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${r.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Para quien llega con el enlace directo: la explicación en castellano y la vuelta a su libro. */
function errorPage(status: number, error: string, bookId: string | null): Response {
  const back = bookId && /^[a-z0-9]{8,16}$/.test(bookId) ? `/crear?b=${bookId}` : "/";
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>No hemos podido preparar el PDF · Érase su vez</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6efe3; color: #2b2622; font: 17px/1.5 Georgia, "Times New Roman", serif; }
  main { max-width: 30rem; padding: 2rem 1.25rem; text-align: center; }
  h1 { font-size: 1.6rem; line-height: 1.2; margin: 0 0 .75rem; }
  p { margin: 0 0 1.5rem; color: #57504a; }
  a { display: inline-block; padding: .8rem 1.4rem; border-radius: 999px; background: #2b2622; color: #fff; text-decoration: none; font: 600 16px/1.2 system-ui, sans-serif; }
</style></head>
<body><main><h1>No hemos podido preparar el PDF</h1><p>${esc(pdfErrorMessage(error))}</p><a href="${esc(back)}">Volver a tu libro</a></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

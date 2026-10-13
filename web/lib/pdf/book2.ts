import "server-only";
import { launch } from "./render";
import type { Plan } from "../plan/types";

/**
 * PDF del flujo nuevo (D5): A4 vertical, imagen 3:2 arriba a sangre y el texto en su banda debajo (la maqueta del libro
 * de muestra, docs/MUESTRA-LUNA.md). Sin filtros SVG, así que basta con page.pdf(): las ilustraciones van como JPEG
 * y el texto queda seleccionable.
 *
 * - "full": portada, dedicatoria, 12 páginas ilustradas y «Fin».
 * - "free" (D3): portada ilustrada, dedicatoria y 12 páginas solo con texto (PDF casero gratis).
 */
export interface Book2PdfInput {
  plan: Plan;
  heroName: string;
  from?: string;
  coverUrl: string | null;
  /** URL de la ilustración de cada página (1..12); en "free" se ignoran. */
  pageUrls: Record<number, string | null>;
  kind: "full" | "free";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paras = (t: string) =>
  t
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${esc(l)}</p>`)
    .join("");

export function book2Html({ plan, heroName, from, coverUrl, pageUrls, kind }: Book2PdfInput): string {
  const css = `
@import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Geist:wght@400;500&display=block");
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { background: #fbf7ef; color: #2b2520; font-family: Fraunces, Georgia, serif; }
.page { width: 210mm; height: 297mm; position: relative; overflow: hidden; break-after: page; background: #fbf7ef; }
.img { width: 210mm; height: 140mm; display: block; object-fit: cover; background: #efe8dc; }
.band { height: 157mm; padding: 0 26mm 24mm; display: flex; flex-direction: column; justify-content: center; }
.band p { font-size: 20pt; line-height: 1.48; font-variation-settings: "opsz" 24; margin-bottom: 3.5mm; text-wrap: pretty; }
.free .band { height: 297mm; padding: 40mm 30mm; }
.free .band p { font-size: 21pt; }
.num { position: absolute; bottom: 14mm; left: 0; right: 0; text-align: center; font-family: Geist, sans-serif; font-size: 9pt; letter-spacing: .12em; color: #8a7d6e; }
.cover h1 { position: absolute; top: 9mm; left: 14mm; right: 14mm; font-size: 38pt; line-height: 1.05; font-weight: 600; color: #fbf3df; font-variation-settings: "opsz" 144; text-shadow: 0 1mm 4mm rgba(10,20,50,.5); }
.cover .sub { height: 157mm; display: flex; flex-direction: column; justify-content: center; text-align: center; padding-bottom: 12mm; }
.cover .sub .para { font-style: italic; font-size: 20pt; }
.cover .sub .name { font-size: 40pt; font-weight: 600; margin-top: 4mm; font-variation-settings: "opsz" 144; }
.cover .sub .from { font-family: Geist, sans-serif; font-size: 10pt; letter-spacing: .14em; text-transform: uppercase; color: #8a7d6e; margin-top: 10mm; }
.cover.noimg h1 { position: static; color: #2b2520; text-shadow: none; padding: 40mm 20mm 0; text-align: center; }
.ded { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 0 30mm; text-align: center; }
.ded p { text-wrap: balance; font-style: italic; font-size: 20pt; line-height: 1.45; font-variation-settings: "opsz" 30; }
.end { display: flex; align-items: center; justify-content: center; height: 100%; font-style: italic; font-size: 26pt; }
`;
  const cover = `<section class="page cover${coverUrl ? "" : " noimg"}">${coverUrl ? `<img class="img" src="${esc(coverUrl)}">` : ""}<h1>${esc(plan.title)}</h1>
<div class="sub"><div class="para">Un cuento escrito para</div><div class="name">${esc(heroName)}</div>${from ? `<div class="from">De parte de ${esc(from)}</div>` : ""}</div></section>`;
  const ded = `<section class="page"><div class="ded"><p>${esc(plan.dedication)}</p></div></section>`;
  const pages = plan.pages.map((p) => {
    const url = kind === "full" ? pageUrls[p.n] : null;
    return kind === "full"
      ? `<section class="page">${url ? `<img class="img" src="${esc(url)}">` : `<div class="img"></div>`}<div class="band">${paras(p.text)}</div><div class="num">${p.n}</div></section>`
      : `<section class="page free"><div class="band">${paras(p.text)}</div><div class="num">${p.n}</div></section>`;
  });
  const end = `<section class="page"><div class="end">Fin</div></section>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(plan.title)}</title><style>${css}</style></head><body>${[cover, ded, ...pages, end].join("")}</body></html>`;
}

export async function renderBook2Pdf(input: Book2PdfInput, timeoutMs = 90_000): Promise<Uint8Array> {
  const t0 = Date.now();
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent(book2Html(input), { waitUntil: "load", timeout: timeoutMs });
    await page.evaluate(() => (document as Document & { fonts: FontFaceSet }).fonts.ready);
    // las ilustraciones (URLs firmadas) tienen que estar cargadas antes de imprimir
    await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete && i.naturalWidth > 0), { timeout: Math.max(5_000, timeoutMs - (Date.now() - t0)) }).catch(() => undefined);
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, timeout: Math.max(5_000, timeoutMs - (Date.now() - t0)) });
    console.log(`[pdf2] ${input.kind} ${pdf.length} bytes en ${Date.now() - t0} ms`);
    return pdf;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

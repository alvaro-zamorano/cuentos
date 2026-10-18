import { joinDashes } from "./text";
import { PRINT_INNER_PAGES, type CoverGeometry, type PrintSize } from "../print/gelato";
import type { Plan } from "../plan/types";

/**
 * Maqueta del libro impreso (B8, D7): tapa dura cuadrada (20×20 en Gelato) con 30 páginas interiores, cada una con 4 mm
 * de sangre. Sin dependencias de servidor, para probarla en los tests; la imprime lib/pdf/print.ts.
 *
 * Interior (página 1 = derecha):
 *   1 portadilla · 2 «así son los personajes» (la hoja) · 3 dedicatoria
 *   4–27 las 12 escenas a doble página: ilustración a la izquierda (par) y texto a la derecha (impar)
 *   28 «Fin» · 29 colofón · 30 en blanco (la imprenta puede poner ahí su código de montaje)
 * Cubierta: un pliego con trasera, lomo y portada, con las medidas que da la API de Gelato para ese número de páginas.
 */
export interface PrintBookInput {
  plan: Plan;
  heroName: string;
  from?: string;
  coverUrl: string | null;
  sheetUrl: string | null;
  pageUrls: Record<number, string | null>;
  /** Fecha del colofón («octubre de 2026»). */
  date: Date;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const paras = (t: string) =>
  t
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${joinDashes(esc(l))}</p>`)
    .join("");

const FONTS = `@import url("https://fonts.googleapis.com/css2?family=Lora:wght@400..700&family=Figtree:wght@400;500;600;700&display=block");`;
const PAPER = "#fbf7ef";
const INK = "#2b2520";
const SOFT = "#6f6457";
const NIGHT = "#1d2747";
const MOON = "#fbf3df";
const STAR = "#f2b84b";

/** Texto largo en la página de texto: un poco más pequeño para que quepa con margen. */
function textSize(t: string): number {
  const n = t.length;
  if (n > 650) return 13;
  if (n > 480) return 14.5;
  if (n > 320) return 16;
  return 17.5;
}

export function monthYear(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(d);
}

/** HTML del interior: PRINT_INNER_PAGES páginas de (trim + 2·sangre) mm de lado. */
export function printInteriorHtml(input: PrintBookInput, size: PrintSize): { html: string; pages: number; widthMm: number; heightMm: number } {
  const { plan, heroName, from, sheetUrl, pageUrls, date } = input;
  const W = size.trimWidth + 2 * size.bleed;
  const H = size.trimHeight + 2 * size.bleed;
  const safe = size.bleed + 14; // margen de seguridad desde el borde del papel sin cortar
  const css = `${FONTS}
@page { size: ${W}mm ${H}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { background: ${PAPER}; color: ${INK}; font-family: Lora, Georgia, serif; }
.pg { width: ${W}mm; height: ${H}mm; position: relative; overflow: hidden; break-after: page; background: ${PAPER}; }
.center { position: absolute; inset: ${safe}mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.title { font-size: 30pt; font-weight: 600; line-height: 1.1; letter-spacing: -.01em; text-wrap: balance; }
.for { font-size: 15pt; color: ${SOFT}; margin-top: 10mm; }
.name { font-size: 26pt; font-weight: 600; margin-top: 2mm; }
.from { font-family: Figtree, sans-serif; font-size: 8.5pt; letter-spacing: .16em; text-transform: uppercase; color: ${SOFT}; margin-top: 12mm; }
.label { font-family: Figtree, sans-serif; font-size: 8.5pt; letter-spacing: .16em; text-transform: uppercase; color: ${SOFT}; margin-bottom: 6mm; }
.sheet { width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 2mm; background: #efe8dc; }
.ded p { font-size: 16pt; line-height: 1.55; color: #4a4140; text-wrap: balance; }
.ill { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); width: ${W}mm; height: ${(W * 2) / 3}mm; object-fit: cover; display: block; background: #efe8dc; }
.txt { position: absolute; inset: ${safe}mm ${safe + 2}mm; display: flex; flex-direction: column; justify-content: center; }
.txt p { line-height: 1.55; margin-bottom: 3.2mm; text-wrap: pretty; }
.num { position: absolute; bottom: ${size.bleed + 8}mm; left: 0; right: 0; text-align: center; font-family: Figtree, sans-serif; font-size: 8pt; letter-spacing: .12em; color: #8a7d6e; }
.fin { font-size: 24pt; font-weight: 600; }
.colo { font-size: 10.5pt; line-height: 1.6; color: ${SOFT}; max-width: 120mm; }
.colo strong { color: ${INK}; font-weight: 600; }
.brand { font-family: Lora, Georgia, serif; font-size: 11pt; color: ${INK}; margin-top: 8mm; }
.brand span { color: ${STAR}; }
`;
  const pages: string[] = [];
  pages.push(
    `<section class="pg"><div class="center"><div class="title">${esc(plan.title)}</div><div class="for">Un cuento escrito para</div><div class="name">${esc(heroName)}</div>${from ? `<div class="from">De parte de ${esc(from)}</div>` : ""}</div></section>`,
  );
  pages.push(
    `<section class="pg"><div class="center"><div class="label">Así son los personajes</div>${sheetUrl ? `<img class="sheet" src="${esc(sheetUrl)}">` : `<div class="sheet"></div>`}</div></section>`,
  );
  pages.push(`<section class="pg"><div class="center ded"><p>${esc(plan.dedication)}</p></div></section>`);
  for (const p of plan.pages) {
    const url = pageUrls[p.n];
    pages.push(`<section class="pg">${url ? `<img class="ill" src="${esc(url)}">` : `<div class="ill"></div>`}</section>`);
    pages.push(`<section class="pg"><div class="txt" style="font-size:${textSize(p.text)}pt">${paras(p.text)}</div><div class="num">${p.n}</div></section>`);
  }
  pages.push(`<section class="pg"><div class="center"><div class="fin">Fin</div></div></section>`);
  pages.push(
    `<section class="pg"><div class="center"><p class="colo">Este libro se escribió y se ilustró para <strong>${esc(heroName)}</strong> en ${esc(monthYear(date))}. El texto y las ilustraciones los hizo una inteligencia artificial, y quien lo regala los revisó página a página.</p><div class="brand"><span>&#10022;</span> Érase su vez</div></div></section>`,
  );
  pages.push(`<section class="pg"></section>`);
  if (pages.length !== PRINT_INNER_PAGES) throw new Error(`maqueta: ${pages.length} páginas en vez de ${PRINT_INNER_PAGES}`);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(plan.title)}</title><style>${css}</style></head><body>${pages.join("")}</body></html>`;
  return { html, pages: pages.length, widthMm: W, heightMm: H };
}

const box = (r: { left: number; top: number; width: number; height: number }) => `left:${r.left}mm;top:${r.top}mm;width:${r.width}mm;height:${r.height}mm`;

/** HTML de la cubierta: un pliego de cover.width × cover.height mm (trasera, lomo y portada). */
export function printCoverHtml(input: PrintBookInput, cover: CoverGeometry): { html: string; widthMm: number; heightMm: number } {
  const { plan, heroName, coverUrl } = input;
  const f = cover.front;
  const b = cover.back;
  const s = cover.spine;
  const imgH = (f.width * 2) / 3;
  const pad = 12; // margen de seguridad dentro de cada cara
  const spineText = s.width >= 5;
  const spineFont = Math.min(9, s.width * 1.6);
  const css = `${FONTS}
@page { size: ${cover.width}mm ${cover.height}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { background: ${NIGHT}; font-family: Lora, Georgia, serif; }
.sheet { width: ${cover.width}mm; height: ${cover.height}mm; position: relative; overflow: hidden; background: ${NIGHT}; }
.area { position: absolute; overflow: hidden; }
.front-img { position: absolute; left: ${f.left - 1}mm; top: ${f.top - 1}mm; width: ${f.width + 2}mm; height: ${imgH + 1}mm; object-fit: cover; }
.shade { position: absolute; left: ${f.left - 1}mm; top: ${f.top - 1}mm; width: ${f.width + 2}mm; height: ${imgH * 0.45}mm; background: linear-gradient(to bottom, rgba(15,20,40,.55), rgba(15,20,40,0)); }
.title { position: absolute; left: ${f.left + pad}mm; top: ${f.top + pad}mm; width: ${f.width - 2 * pad}mm; font-size: 31pt; font-weight: 600; line-height: 1.06; letter-spacing: -.01em; color: ${MOON}; text-shadow: 0 1mm 4mm rgba(10,20,50,.5); text-wrap: balance; }
.band { position: absolute; left: ${f.left}mm; top: ${f.top + imgH}mm; width: ${f.width}mm; height: ${f.height - imgH}mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: ${MOON}; padding-bottom: 4mm; }
.band .for { font-size: 14pt; color: #b9c1da; }
.band .name { font-size: 28pt; font-weight: 600; margin-top: 1mm; }
.back { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #e4e8f2; padding: ${pad}mm ${pad + 8}mm ${pad + 30}mm; }
.back p { font-size: 15pt; line-height: 1.6; text-wrap: balance; }
.back .brand { font-size: 15pt; color: ${MOON}; margin-top: 10mm; }
.back .brand span { color: ${STAR}; }
.back .web { font-family: Figtree, sans-serif; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; color: #b9c1da; margin-top: 2mm; }
.spine { display: flex; align-items: center; justify-content: center; }
.spine div { transform: rotate(90deg); white-space: nowrap; font-size: ${spineFont}pt; color: ${MOON}; font-weight: 600; letter-spacing: .02em; }
`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cubierta</title><style>${css}</style></head><body><div class="sheet">
${coverUrl ? `<img class="front-img" src="${esc(coverUrl)}">` : ""}
<div class="shade"></div>
<div class="title">${esc(plan.title)}</div>
<div class="band"><div class="for">Un cuento para</div><div class="name">${esc(heroName)}</div></div>
<div class="area back" style="${box(b)}"><p>Un cuento escrito e ilustrado para ${esc(heroName)}. Nadie más tiene uno igual.</p><div class="brand"><span>&#10022;</span> Érase su vez</div><div class="web">erasesuvez.es</div></div>
${spineText ? `<div class="area spine" style="${box(s)}"><div>${esc(plan.title.length > 48 ? `${plan.title.slice(0, 46)}…` : plan.title)}</div></div>` : ""}
</div></body></html>`;
  return { html, widthMm: cover.width, heightMm: cover.height };
}

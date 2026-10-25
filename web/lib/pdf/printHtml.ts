import { joinDashes } from "./text";
import { PRINT_INNER_PAGES, type CoverGeometry, type PrintSize } from "../print/gelato";
import type { Plan } from "../plan/types";

/** Dominio de la marca que va impreso en la contracubierta (comprado el 18 oct; el .es no es nuestro). */
export const SITE_DOMAIN = "erasesuvez.com";

/**
 * Maqueta del libro (D5 bis, 18 oct): un libro apaisado normal. Cada escena va a doble página: la ilustración a página
 * completa (a sangre) a la izquierda y el texto a la derecha. La misma maqueta sirve para la imprenta y para los PDF.
 * Sin dependencias de servidor, para probarla en los tests; la imprimen lib/pdf/print.ts y lib/pdf/book2.ts.
 *
 * - "print": interior de la tapa dura (Gelato, ≈ 280×210 mm con 4 mm de sangre), 30 páginas (página 1 = derecha):
 *     1 portadilla · 2 «así son los personajes» · 3 dedicatoria · 4–27 las 12 escenas (ilustración en par, texto en
 *     impar) · 28 «Fin» · 29 colofón · 30 en blanco (la imprenta puede poner ahí su código de montaje)
 * - "full": PDF ilustrado en A4 apaisado: portada, personajes, dedicatoria, 12 dobles, «Fin» y colofón (29). Con la
 *     portada sola, las dobles caen como en el libro (ilustración a la izquierda) en la vista de dos páginas.
 * - "free" (D3): PDF casero en A4 apaisado: portada, personajes, dedicatoria, 12 páginas de texto, «Fin» y colofón.
 * Cubierta del impreso: un pliego con trasera, lomo y portada, con las medidas que da la API de Gelato.
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

export type BookKind = "print" | "full" | "free";

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
const TEJA = "#c8492c";

/**
 * Estrella de la marca en SVG (la misma de la web). No vale el carácter «✦»: Lora y Figtree no lo tienen y el Chromium
 * de Vercel no trae fuentes del sistema, así que salía un cuadradito en la contracubierta y el colofón (22 oct).
 * Regla: en la maqueta, solo caracteres que tengan Lora o Figtree; los adornos, en SVG.
 */
export const STAR_SVG = `<svg class="star" aria-hidden="true" viewBox="0 0 24 24"><path fill="${STAR}" d="M12 0C12.9 7.2 16.8 11.1 24 12C16.8 12.9 12.9 16.8 12 24C11.1 16.8 7.2 12.9 0 12C7.2 11.1 11.1 7.2 12 0Z"/></svg>`;

/** Página de texto: un poco más pequeña cuanto más largo es el texto, para que quepa con margen. */
export function textSize(t: string): number {
  const n = t.length;
  if (n > 650) return 16.5;
  if (n > 480) return 18;
  if (n > 320) return 20;
  return 22;
}

export function monthYear(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "Europe/Madrid" }).format(d);
}

/** Primera letra del texto como capitular (con su raya de diálogo si empieza por ella). */
function storyHtml(t: string): string {
  const html = paras(t);
  return html.replace(/^<p>((?:—|&#8288;|\u2060)*)([^<\s—])/, (_m, pre: string, ch: string) => `<p>${pre}<span class="cap">${ch}</span>`);
}

/**
 * Páginas del libro de `kind` en páginas de W×H mm (ya con la sangre) y el CSS que las pinta. `bleed` es la sangre de
 * cada lado (0 en los PDF): los márgenes de seguridad se cuentan desde el corte.
 */
export function bookPages(input: PrintBookInput, kind: BookKind, W: number, H: number, bleed: number): { css: string; pages: string[] } {
  const { plan, heroName, from, coverUrl, sheetUrl, pageUrls, date } = input;
  const safe = bleed + 14;
  const css = `${FONTS}
@page { size: ${W}mm ${H}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { background: ${PAPER}; color: ${INK}; font-family: Lora, Georgia, serif; }
.pg { width: ${W}mm; height: ${H}mm; position: relative; overflow: hidden; break-after: page; background: ${PAPER}; }
.center { position: absolute; inset: ${safe}mm ${safe + 6}mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.title { font-size: 32pt; font-weight: 600; line-height: 1.1; letter-spacing: -.01em; text-wrap: balance; max-width: 190mm; }
.for { font-size: 15pt; color: ${SOFT}; margin-top: 10mm; }
.name { font-size: 28pt; font-weight: 600; margin-top: 2mm; }
.from { font-family: Figtree, sans-serif; font-size: 8.5pt; letter-spacing: .16em; text-transform: uppercase; color: ${SOFT}; margin-top: 12mm; }
.label { font-family: Figtree, sans-serif; font-size: 8.5pt; letter-spacing: .16em; text-transform: uppercase; color: ${SOFT}; margin-bottom: 6mm; }
.sheet { height: ${Math.round(H - 2 * safe - 18)}mm; max-width: 100%; aspect-ratio: 3 / 2; object-fit: cover; border-radius: 2mm; background: #efe8dc; }
.ded p { font-size: 21pt; line-height: 1.55; color: #4a4140; text-wrap: balance; max-width: 170mm; }
.ill { position: absolute; inset: 0; width: ${W}mm; height: ${H}mm; object-fit: cover; display: block; background: #efe8dc; }
.txt { position: absolute; inset: ${safe}mm ${safe + 10}mm ${safe + 8}mm; display: flex; flex-direction: column; justify-content: center; align-items: center; }
.txt div { max-width: 175mm; }
.txt p { line-height: 1.6; margin-bottom: 3.4mm; text-wrap: pretty; }
.cap { float: left; font-size: 3.1em; line-height: .82; font-weight: 600; color: ${TEJA}; margin: 1.2mm 2mm 0 0; }
.num { position: absolute; bottom: ${bleed + 8}mm; left: 0; right: 0; text-align: center; font-family: Figtree, sans-serif; font-size: 8pt; letter-spacing: .12em; color: #8a7d6e; }
.fin { font-size: 26pt; font-weight: 600; }
.colo { font-size: 10.5pt; line-height: 1.6; color: ${SOFT}; max-width: 130mm; }
.colo strong { color: ${INK}; font-weight: 600; }
.brand { font-family: Lora, Georgia, serif; font-size: 11pt; color: ${INK}; margin-top: 8mm; }
.brand .star { width: .8em; height: .8em; vertical-align: -0.05em; margin-right: .15em; }
.cover { background: ${NIGHT}; }
.cover .shade { position: absolute; inset: 0 0 auto; height: 58%; background: linear-gradient(to bottom, rgba(15,20,40,.62), rgba(15,20,40,0)); }
.cover .head { position: absolute; top: ${safe}mm; left: ${safe + 4}mm; right: 34%; color: ${MOON}; text-shadow: 0 1mm 4mm rgba(10,20,50,.55); }
.cover .head .title { font-size: 48pt; line-height: 1.04; text-wrap: balance; max-width: none; }
.cover .head .for { color: ${MOON}; margin-top: 6mm; font-size: 20pt; }
.cover .head .for strong { font-weight: 600; }
.cover .head .from { color: ${MOON}; opacity: .85; margin-top: 4mm; font-size: 10pt; }
`;
  const cover = () =>
    `<section class="pg cover">${coverUrl ? `<img class="ill" src="${esc(coverUrl)}">` : ""}<div class="shade"></div><div class="head"><div class="title">${esc(plan.title)}</div><div class="for">Un cuento para <strong>${esc(heroName)}</strong></div>${from ? `<div class="from">De parte de ${esc(from)}</div>` : ""}</div></section>`;
  const textPage = (n: number, t: string) =>
    `<section class="pg"><div class="txt" style="font-size:${textSize(t)}pt"><div>${storyHtml(t)}</div></div><div class="num">${n}</div></section>`;

  const pages: string[] = [];
  if (kind === "print") {
    pages.push(
      `<section class="pg"><div class="center"><div class="title">${esc(plan.title)}</div><div class="for">Un cuento escrito para</div><div class="name">${esc(heroName)}</div>${from ? `<div class="from">De parte de ${esc(from)}</div>` : ""}</div></section>`,
    );
  } else {
    pages.push(cover());
  }
  pages.push(
    `<section class="pg"><div class="center"><div class="label">Así son los personajes</div>${sheetUrl ? `<img class="sheet" src="${esc(sheetUrl)}">` : `<div class="sheet"></div>`}</div></section>`,
  );
  pages.push(`<section class="pg"><div class="center ded"><p>${esc(plan.dedication)}</p></div></section>`);
  for (const p of plan.pages) {
    if (kind !== "free") {
      const url = pageUrls[p.n];
      pages.push(`<section class="pg">${url ? `<img class="ill" src="${esc(url)}">` : `<div class="ill"></div>`}</section>`);
    }
    pages.push(textPage(p.n, p.text));
  }
  pages.push(`<section class="pg"><div class="center"><div class="fin">Fin</div></div></section>`);
  pages.push(
    `<section class="pg"><div class="center"><p class="colo">Este libro se escribió y se ilustró para <strong>${esc(heroName)}</strong> en ${esc(monthYear(date))}. El texto y las ilustraciones los hizo una inteligencia artificial, y quien lo regala los revisó página a página.</p><div class="brand">${STAR_SVG} Érase su vez</div></div></section>`,
  );
  if (kind === "print") pages.push(`<section class="pg"></section>`);
  return { css, pages };
}

const doc = (title: string, css: string, pages: string[]) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${pages.join("")}</body></html>`;

/** HTML del interior del impreso: PRINT_INNER_PAGES páginas de (corte + 2·sangre) mm. */
export function printInteriorHtml(input: PrintBookInput, size: PrintSize): { html: string; pages: number; widthMm: number; heightMm: number } {
  const W = size.trimWidth + 2 * size.bleed;
  const H = size.trimHeight + 2 * size.bleed;
  const { css, pages } = bookPages(input, "print", W, H, size.bleed);
  if (pages.length !== PRINT_INNER_PAGES) throw new Error(`maqueta: ${pages.length} páginas en vez de ${PRINT_INNER_PAGES}`);
  return { html: doc(input.plan.title, css, pages), pages: pages.length, widthMm: W, heightMm: H };
}

/** A4 apaisado, sin sangre (los PDF que se descargan). */
export const PDF_PAGE = { widthMm: 297, heightMm: 210 } as const;

export function pdfBookHtml(input: PrintBookInput, kind: "full" | "free"): { html: string; pages: number } {
  const { css, pages } = bookPages(input, kind, PDF_PAGE.widthMm, PDF_PAGE.heightMm, 0);
  return { html: doc(input.plan.title, css, pages), pages: pages.length };
}

const box = (r: { left: number; top: number; width: number; height: number }) => `left:${r.left}mm;top:${r.top}mm;width:${r.width}mm;height:${r.height}mm`;

/**
 * HTML de la cubierta: un pliego de cover.width × cover.height mm (trasera, lomo y portada). La portada lleva la
 * ilustración a sangre (hasta el borde del pliego, que se dobla) con el título arriba, como la del PDF.
 */
export function printCoverHtml(input: PrintBookInput, cover: CoverGeometry): { html: string; widthMm: number; heightMm: number } {
  const { plan, heroName, from, coverUrl } = input;
  const f = cover.front;
  const b = cover.back;
  const s = cover.spine;
  const pad = 14; // margen de seguridad dentro de cada cara
  const imgLeft = f.left - 1; // 1 mm dentro de la bisagra para no dejar una raya de noche en el pliegue
  const spineText = s.width >= 5;
  const spineFont = Math.min(9, s.width * 1.6);
  const css = `${FONTS}
@page { size: ${cover.width}mm ${cover.height}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { background: ${NIGHT}; font-family: Lora, Georgia, serif; }
.sheet { width: ${cover.width}mm; height: ${cover.height}mm; position: relative; overflow: hidden; background: ${NIGHT}; }
.area { position: absolute; overflow: hidden; }
.front-img { position: absolute; left: ${imgLeft}mm; top: 0; width: ${cover.width - imgLeft}mm; height: ${cover.height}mm; object-fit: cover; }
.shade { position: absolute; left: ${imgLeft}mm; top: 0; width: ${cover.width - imgLeft}mm; height: ${f.top + f.height * 0.58}mm; background: linear-gradient(to bottom, rgba(15,20,40,.62), rgba(15,20,40,0)); }
.head { position: absolute; left: ${f.left + pad}mm; top: ${f.top + pad}mm; width: ${f.width * 0.64}mm; color: ${MOON}; text-shadow: 0 1mm 4mm rgba(10,20,50,.55); }
.title { font-size: 46pt; font-weight: 600; line-height: 1.04; letter-spacing: -.01em; text-wrap: balance; }
.for { font-size: 19pt; margin-top: 6mm; }
.for strong { font-weight: 600; }
.from { font-family: Figtree, sans-serif; font-size: 10pt; letter-spacing: .16em; text-transform: uppercase; opacity: .85; margin-top: 4mm; }
.back { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #e4e8f2; padding: ${pad}mm ${pad + 20}mm ${pad + 24}mm; }
.back p { font-size: 15pt; line-height: 1.6; text-wrap: balance; }
.back .brand { font-size: 15pt; color: ${MOON}; margin-top: 10mm; }
.back .brand .star { width: .8em; height: .8em; vertical-align: -0.05em; margin-right: .15em; }
.back .web { font-family: Figtree, sans-serif; font-size: 8pt; letter-spacing: .14em; text-transform: uppercase; color: #b9c1da; margin-top: 2mm; }
.spine { display: flex; align-items: center; justify-content: center; }
.spine div { transform: rotate(90deg); white-space: nowrap; font-size: ${spineFont}pt; color: ${MOON}; font-weight: 600; letter-spacing: .02em; }
`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cubierta</title><style>${css}</style></head><body><div class="sheet">
${coverUrl ? `<img class="front-img" src="${esc(coverUrl)}">` : ""}
<div class="shade"></div>
<div class="head"><div class="title">${esc(plan.title)}</div><div class="for">Un cuento para <strong>${esc(heroName)}</strong></div>${from ? `<div class="from">De parte de ${esc(from)}</div>` : ""}</div>
<div class="area back" style="${box(b)}"><p>Un cuento escrito e ilustrado para ${esc(heroName)}. Nadie más tiene uno igual.</p><div class="brand">${STAR_SVG} Érase su vez</div><div class="web">${SITE_DOMAIN}</div></div>
${spineText ? `<div class="area spine" style="${box(s)}"><div>${esc(plan.title.length > 48 ? `${plan.title.slice(0, 46)}…` : plan.title)}</div></div>` : ""}
</div></body></html>`;
  return { html, widthMm: cover.width, heightMm: cover.height };
}

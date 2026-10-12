#!/usr/bin/env node
/**
 * Fabrica las piezas de la marioneta pintada a partir del catálogo (public/catalog/<estilo>/) para todos los estilos
 * que tengan hair/ y outfit/ completos. Se ejecuta en `prebuild` (también en Vercel), así que los PNG derivados no
 * necesitan estar en el repo: el catálogo es la fuente y esto es un paso de build.
 *
 *   - cabezas: bust de pelo recortado por la barbilla → public/pieces/<estilo>/heads/<pelo>.png
 *   - cuerpos: conjunto sin cabeza (cuello visible) → public/pieces/<estilo>/bodies/<conjunto>.png
 *   - mascotas y abuelos recortados → pets/, grandparents/
 *   - opcional (assets/raw/<estilo>/ en la raíz del repo, no versionado; ver docs/ASSETS.md):
 *       backgrounds/<escena>.* → backgrounds/<escena>.jpg (1200×800) + colocación de ../scripts/backgrounds_layout.json
 *       poses/<pose>/<prenda>.png → poses/<pose>/<prenda>.png (sin cabeza)
 *   - lib/pieces.generated.ts con los manifests de los estilos disponibles.
 *
 * Encaje cabeza-cuerpo: escala y centro por las pupilas (eyes), altura por la base del cuello (lib/pieces.ts, placeHead).
 * ../scripts/pieces_build.py queda como referencia antigua: no mide pupilas. Recolor de piel y pelo: en cliente (lib/recolor.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(WEB, "..");
const CATALOG = path.join(WEB, "public", "catalog");
const PIECES = path.join(WEB, "public", "pieces");
const RAW = path.join(ROOT, "assets", "raw");
const LAYOUT = path.join(ROOT, "scripts", "backgrounds_layout.json");
const SCENES = ["cama-manana", "ventana", "desayuno", "puerta-regalo", "salon-globos", "nube-deseo", "parque", "jardin-juego", "mesa-tarta", "velas", "abrir-regalo", "cama-noche"];
const BG_W = 1200, BG_H = 800;
// mismo orden e ids que lib/traits.ts
const SKINS = ["muy-clara", "clara", "melocoton", "media", "tostada", "morena", "morena-oscura", "oscura"];
const HAIR_COLORS = ["castano", "negro", "rubio", "pelirrojo", "caoba"];

/** @typedef {{ w: number, h: number, data: Uint8ClampedArray }} Img  RGBA */

async function load(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}
async function savePng(img, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await sharp(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), { raw: { width: img.w, height: img.h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(file);
}

/* ---------- máscaras (idénticas a lib/recolor.ts / pieces_build.py) ---------- */

function isSkin(r, g, b, a) {
  if (a === 0) return false;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx !== r || mx === mn) return false;
  const hue = (60 * (g - b)) / (mx - mn);
  const s = (mx - mn) / mx;
  return hue >= 8 && hue <= 34 && s >= 0.3 && s <= 0.8 && mx >= 158;
}
function isHair(r, g, b, a) {
  if (a === 0) return false;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = (mx - mn) / Math.max(mx, 1);
  return r > g && g >= b && r < 200 && r - b > 30 && sat > 0.35 && !isSkin(r, g, b, a);
}

/* ---------- recorte del fondo blanco ---------- */

/** Etiqueta componentes 4-conexos de una máscara booleana. Devuelve labels (0 = fuera) y cajas por etiqueta. */
function label(mask, w, h) {
  const lab = new Int32Array(w * h);
  const boxes = [null];
  const stack = new Int32Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i]) continue;
    n++;
    const box = { x0: w, x1: 0, y0: h, y1: 0, size: 0, border: false };
    let sp = 0;
    stack[sp++] = i;
    lab[i] = n;
    while (sp) {
      const p = stack[--sp];
      const x = p % w, y = (p / w) | 0;
      box.size++;
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) box.border = true;
      const nb = [p - 1, p + 1, p - w, p + w];
      if (x === 0) nb[0] = -1; if (x === w - 1) nb[1] = -1; if (y === 0) nb[2] = -1; if (y === h - 1) nb[3] = -1;
      for (const q of nb) if (q >= 0 && mask[q] && !lab[q]) { lab[q] = n; stack[sp++] = q; }
    }
    boxes.push(box);
  }
  return { lab, boxes };
}

/** Desenfoque gaussiano (σ≈0.8) separable sobre un canal de 8 bits. */
function blur(ch, w, h) {
  const k = [0.0545, 0.2442, 0.4026, 0.2442, 0.0545];
  const tmp = new Float32Array(w * h), out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -2; i <= 2; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)); s += ch[y * w + xx] * k[i + 2]; }
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -2; i <= 2; i++) { const yy = Math.min(h - 1, Math.max(0, y + i)); s += tmp[yy * w + x] * k[i + 2]; }
    out[y * w + x] = Math.round(s);
  }
  return out;
}

/**
 * Fondo blanco → transparente: el blanco conectado con el borde, la sombra gris neutra pintada bajo los pies,
 * el hueco blanco entre las piernas (encerrado, centrado, alto) y los restos de suelo entre los zapatos.
 * Los blancos interiores pequeños (ojos) se conservan.
 */
function cutout(img) {
  const { w, h, data } = img;
  const bglike = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const y = (i / w) | 0;
    const white = mn > 232;
    const greyShadow = mx - mn < 12 && mn > 150 && y > h * 0.7;
    bglike[i] = white || greyShadow ? 1 : 0;
  }
  const { lab, boxes } = label(bglike, w, h);
  const remove = new Uint8Array(boxes.length);
  for (let i = 1; i < boxes.length; i++) {
    const bx = boxes[i];
    const hh = bx.y1 - bx.y0 + 1, cx = (bx.x0 + bx.x1 + 1) / 2;
    if (bx.border) remove[i] = 1;
    else if (bx.y0 > h * 0.45 && hh > h * 0.06 && cx > 0.38 * w && cx < 0.62 * w) remove[i] = 1; // hueco entre piernas
    else if (bx.y0 > h * 0.88 && cx > 0.25 * w && cx < 0.75 * w) remove[i] = 1; // suelo entre zapatos
  }
  const alpha = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = lab[i] && remove[lab[i]] ? 0 : 255;
  const soft = blur(alpha, w, h);
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < w * h; i++) out[i * 4 + 3] = Math.min(out[i * 4 + 3], soft[i]);
  return { w, h, data: out };
}

/* ---------- piezas ---------- */

function faceGeom(img, maxRowFrac) {
  const { w, h, data } = img;
  const cols = new Int32Array(w), rows = new Int32Array(h);
  const limit = Math.floor(h * maxRowFrac);
  for (let y = 0; y < limit; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (isSkin(data[i], data[i + 1], data[i + 2], data[i + 3])) { cols[x]++; rows[y]++; }
  }
  let x0 = -1, x1 = -1, y1 = -1;
  for (let x = 0; x < w; x++) if (cols[x] > 3) { if (x0 < 0) x0 = x; x1 = x; }
  for (let y = 0; y < limit; y++) if (rows[y] > 3) y1 = y;
  return { faceW: x0 >= 0 ? x1 - x0 : Math.round(w * 0.5), faceCx: x0 >= 0 ? Math.round((x0 + x1) / 2) : Math.round(w / 2), chin: y1 >= 0 ? y1 : Math.round(h * 0.37) };
}

/**
 * Pupilas: las dos manchas oscuras más grandes dentro de la cara (el componente de piel mayor), a la misma altura.
 * Es la referencia de escala y posición fiable entre piezas: la anchura de piel que mide faceGeom incluye mechones
 * claros del pelo que la máscara confunde con piel, y varía hasta un 60 % entre peinados aunque la cara mida lo mismo.
 * Devuelve distancia entre pupilas (iod), su punto medio y su altura, o null si no las encuentra.
 */
function eyes(img, maxRowFrac) {
  const { w, h, data } = img;
  const lim = Math.floor(h * maxRowFrac);
  const sk = new Uint8Array(w * lim);
  for (let p = 0; p < w * lim; p++) { const i = p * 4; sk[p] = isSkin(data[i], data[i + 1], data[i + 2], data[i + 3]) ? 1 : 0; }
  const { lab, boxes } = label(sk, w, lim);
  let face = 0;
  for (let k = 1; k < boxes.length; k++) if (!face || boxes[k].size > boxes[face].size) face = k;
  if (!face) return null;
  // franja de la cara por fila (rellena los huecos: ojos, boca)
  const rowL = new Int32Array(lim).fill(-1), rowR = new Int32Array(lim).fill(-1);
  for (let y = 0; y < lim; y++) for (let x = 0; x < w; x++) if (lab[y * w + x] === face) { if (rowL[y] < 0) rowL[y] = x; rowR[y] = x; }
  const dark = new Uint8Array(w * lim);
  for (let y = 0; y < lim; y++) {
    if (rowL[y] < 0) continue;
    for (let x = rowL[y]; x <= rowR[y]; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 200 && Math.max(data[i], data[i + 1], data[i + 2]) < 70) dark[y * w + x] = 1;
    }
  }
  const { lab: dl, boxes: db } = label(dark, w, lim);
  const sx = new Float64Array(db.length), sy = new Float64Array(db.length);
  for (let p = 0; p < w * lim; p++) if (dl[p]) { sx[dl[p]] += p % w; sy[dl[p]] += (p / w) | 0; }
  const blobs = [];
  for (let k = 1; k < db.length; k++) if (db[k].size >= 6 && db[k].size <= 2000) blobs.push({ n: db[k].size, x: sx[k] / db[k].size, y: sy[k] / db[k].size });
  blobs.sort((a, b) => b.n - a.n);
  for (let i = 0; i < blobs.length; i++) for (let j = i + 1; j < blobs.length; j++) {
    const a = blobs[i], b = blobs[j];
    if (Math.abs(a.y - b.y) < 0.06 * h && Math.abs(a.x - b.x) > 8) {
      const r = (v) => Math.round(v * 10) / 10;
      return { iod: r(Math.abs(a.x - b.x)), eyeCx: r((a.x + b.x) / 2), eyeY: r((a.y + b.y) / 2) };
    }
  }
  return null;
}

function buildHead(src) {
  const im = cutout(src);
  const { w, h, data } = im;
  // barbilla: primera fila (desde la mitad) donde el chubasquero amarillo ocupa > 22 % del ancho
  let chin = Math.round(h * 0.7);
  for (let y = Math.floor(h * 0.5); y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (data[i + 3] > 0 && r > 215 && g > 175 && b < 110 && g - b > 90) n++;
    }
    if (n > w * 0.22) { chin = y; break; }
  }
  // el recorte acaba 4 px por encima de la base del cuello: el tramo inferior del cuello lo pone el cuerpo (con su sombra)
  const hh = Math.min(h, chin + 40);
  const out = new Uint8ClampedArray(data.subarray(0, hh * w * 4));
  // ropa del bust original bajo la barbilla (tercio inferior): se borra con 1 px de margen, salvo piel y pelo.
  // Empieza por debajo de la boca: en lápiz el 62 % de la altura cae a la altura de los ojos y se comía los brillos
  // blancos junto a las pupilas (rayas transparentes en la cara)
  const eA = eyes(im, 0.95);
  const gy0 = eA ? Math.max(Math.floor(hh * 0.62), Math.round(eA.eyeY + eA.iod * 0.7)) : Math.floor(hh * 0.62);
  // dentro de la cara (franja de la mayor mancha de piel en cada fila) tampoco se borra: en lápiz el papel blanco
  // que asoma en la cara pasa por «prenda clara»
  const fsk = new Uint8Array(w * hh);
  for (let p = 0; p < w * hh; p++) { const i = p * 4; fsk[p] = isSkin(data[i], data[i + 1], data[i + 2], data[i + 3]) ? 1 : 0; }
  const { lab: fl, boxes: fb } = label(fsk, w, hh);
  let fk = 0;
  for (let k = 1; k < fb.length; k++) if (!fk || fb[k].size > fb[fk].size) fk = k;
  const faceL = new Int32Array(hh).fill(w), faceR = new Int32Array(hh).fill(-1);
  if (fk) for (let p = 0; p < w * hh; p++) if (fl[p] === fk) { const y = (p / w) | 0, x = p % w; if (x < faceL[y]) faceL[y] = x; if (x > faceR[y]) faceR[y] = x; }
  // solo hasta la barbilla: más abajo la mancha de piel puede incluir sombras del cuello de la prenda
  const faceEnd = eA ? Math.round(eA.eyeY + eA.iod * 1.0) : 0;
  const inFace = (x, y) => y < faceEnd && x > faceL[y] && x < faceR[y];
  const garment = new Uint8Array(w * hh);
  const keep = new Uint8Array(w * hh);
  for (let y = gy0; y < hh; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    const r = out[i], g = out[i + 1], b = out[i + 2], a = out[i + 3];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), sat = (mx - mn) / Math.max(mx, 1);
    const ochre = r > 150 && g > 120 && b < 80 && g - b > 70 && r - g < 95;
    const gm =
      (r > 200 && g > 160 && b < 120 && g - b > 70) ||
      (b > r + 10 && g < 110 && r < 60) ||
      (r > 225 && g > 215 && b > 190 && sat < 0.2) ||
      (r > 200 && g > 170 && b < 170 && g - b > 40 && r - g < 50) ||
      ochre;
    garment[p] = gm ? 1 : 0;
    keep[p] = isSkin(r, g, b, a) || (isHair(r, g, b, a) && !ochre) ? 1 : 0;
  }
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    let dil = garment[p];
    for (let dy = -2; dy <= 2 && !dil; dy++) for (let dx = -2; dx <= 2 && !dil; dx++) {
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && yy < hh && xx >= 0 && xx < w && garment[yy * w + xx]) dil = 1;
    }
    // el borde difuminado de la prenda (mezcla con el fondo, semitransparente) tampoco es piel ni pelo
    const i = p * 4;
    const soft = out[i + 3] > 0 && out[i + 3] < 200 && y >= gy0;
    if ((dil || soft) && !keep[p] && !inFace(x, y)) out[i + 3] = 0;
  }
  // bajo la mandíbula solo queda el cuello (franja central) y el pelo: lo demás a los lados (cuello de la prenda,
  // sombras naranjas que la máscara de piel confunde) se borra
  const g0 = faceGeom({ w, h: hh, data: out }, 1);
  const span = new Int32Array(hh);
  for (let y = 0; y < hh; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (out[i + 3] > 0 && isSkin(out[i], out[i + 1], out[i + 2], out[i + 3])) { if (x0 < 0) x0 = x; x1 = x; } }
    span[y] = x0 < 0 ? 0 : x1 - x0;
  }
  let jaw = chin;
  for (let y = chin; y >= 0; y--) if (span[y] > g0.faceW * 0.6) { jaw = y; break; }
  // Lo que no es piel y no está unido a la masa del pelo son restos del cuello de la prenda (puntas que suben hasta
  // las orejas, sombras ocres que pasan por pelo): componentes pequeños (< 600 px) por debajo de la altura de las orejas
  const nonSkin = new Uint8Array(w * hh);
  for (let p = 0; p < w * hh; p++) { const i = p * 4; nonSkin[p] = out[i + 3] > 0 && !isSkin(out[i], out[i + 1], out[i + 2], out[i + 3]) ? 1 : 0; }
  const { lab: nl, boxes: nb } = label(nonSkin, w, hh);
  const earRow = Math.max(0, jaw - 40);
  // se exceptúan los componentes dentro de la franja de piel de su fila (boca, orejas): son de la cara
  const spanX = new Int32Array(hh * 2);
  for (let y = 0; y < hh; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (out[i + 3] > 0 && isSkin(out[i], out[i + 1], out[i + 2], out[i + 3])) { if (x0 < 0) x0 = x; x1 = x; } }
    spanX[y * 2] = x0; spanX[y * 2 + 1] = x1;
  }
  const drop = new Uint8Array(nb.length);
  for (let k = 1; k < nb.length; k++) {
    const bx = nb[k];
    if (bx.size >= 600 || bx.y0 < earRow - 10) continue;
    const cy = Math.min(hh - 1, Math.round((bx.y0 + bx.y1) / 2)), cx = (bx.x0 + bx.x1) / 2;
    const x0 = spanX[cy * 2], x1 = spanX[cy * 2 + 1];
    const facial = x0 >= 0 && cx >= x0 - 4 && cx <= x1 + 4;
    if (!facial) drop[k] = 1;
  }
  for (let y = earRow; y < hh; y++) for (let x = 0; x < w; x++) { const p = y * w + x; if (nl[p] && drop[nl[p]]) out[p * 4 + 3] = 0; }
  // y bajo la mandíbula, fuera de la franja del cuello, solo puede quedar pelo. Con pupilas, la franja y la mandíbula
  // se miden respecto a ellas (el cuello mide ≈ 0,45 veces la distancia entre pupilas); la anchura de piel de faceGeom
  // incluye mechones del pelo y dejaba pasar las puntas del cuello del chubasquero
  const e0 = eyes({ w, h: hh, data: out }, 0.95);
  let jawN = jaw + 2, band = g0.faceW * 0.3, bandCx = g0.faceCx;
  if (e0) {
    band = e0.iod * 0.4;
    bandCx = e0.eyeCx;
    // mandíbula: primera fila bajo los ojos con menos piel que 0,8 veces la distancia entre pupilas (cerca del centro)
    jawN = hh;
    for (let y = Math.round(e0.eyeY) + Math.round(e0.iod * 0.3); y < hh; y++) {
      let n = 0;
      for (let x = Math.max(0, Math.round(bandCx - e0.iod * 1.2)); x <= Math.min(w - 1, Math.round(bandCx + e0.iod * 1.2)); x++) {
        const i = (y * w + x) * 4;
        if (out[i + 3] > 0 && isSkin(out[i], out[i + 1], out[i + 2], out[i + 3])) n++;
      }
      if (n < e0.iod * 0.8) { jawN = y; break; }
    }
  }
  for (let y = jawN; y < hh; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    if (out[i + 3] === 0 || Math.abs(x - bandCx) <= band) continue;
    if (isSkin(out[i], out[i + 1], out[i + 2], out[i + 3])) out[i + 3] = 0;
  }
  // restos sueltos del cuello del chubasquero junto a los hombros (motas ocres): bajo la mandíbula y fuera del cuello,
  // lo que no forma parte de una masa de pelo grande se quita. Los mechones largos son componentes de miles de píxeles.
  if (e0) {
    const rest = new Uint8Array(w * hh);
    for (let y = jawN; y < hh; y++) for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (out[p * 4 + 3] > 24 && Math.abs(x - bandCx) > band) rest[p] = 1;
    }
    const { lab: rl, boxes: rb } = label(rest, w, hh);
    for (let p = 0; p < w * hh; p++) if (rl[p] && rb[rl[p]].size < 400) out[p * 4 + 3] = 0;
  }
  // desvanecido en el borde inferior: el cuello sigue por debajo en el cuerpo
  for (let y = hh - 6; y < hh; y++) { const f = (hh - 1 - y) / 5; for (let x = 0; x < w; x++) out[(y * w + x) * 4 + 3] = Math.round(out[(y * w + x) * 4 + 3] * f); }
  const head = { w, h: hh, data: out };
  const g = faceGeom(head, 1);
  const e = eyes(head, 0.95);
  if (!e) console.log("  aviso: cabeza sin pupilas detectadas; se encaja por anchura de piel");
  return { img: head, geom: { w, h: hh, chin, faceW: g.faceW, faceCx: g.faceCx, ...(e ?? {}) } };
}

/** Figura entera (fondo ya transparente) → cuerpo sin cabeza + geometría (barbilla, cara). */
function headless(im) {
  const { w, h } = im;
  const g = faceGeom(im, 0.45);
  // los ojos de la cabeza original marcan dónde y a qué tamaño va la cabeza nueva (se miden antes de quitarla)
  const e = eyes(im, 0.45);
  if (!e) console.log("  aviso: figura sin pupilas detectadas; se encaja por anchura de piel");
  // g.chin es la fila más baja de piel: la base del cuello (donde empieza la prenda). Se deja el cuello entero (22 px),
  // opaco y sin desvanecer: la cabeza nueva lo tapa por arriba y así no queda una franja translúcida en la unión
  const headTop = Math.max(0, g.chin - 22);
  const out = new Uint8ClampedArray(im.data);
  for (let y = 0; y < headTop; y++) for (let x = 0; x < w; x++) out[(y * w + x) * 4 + 3] = 0;
  // En esa franja, a los lados del cuello, quedaban la mandíbula, el lóbulo y algún mechón de la cabeza original (que
  // suele estar girada un poco): asomaban como una pestaña junto a la barbilla nueva, que es frontal. Se conserva solo
  // el cuello y lo que está unido a la prenda sin pasar por piel (capucha, cuello de pelo, solapas).
  const d = im.data;
  const solid = (p) => d[p * 4 + 3] > 24;
  const skinP = (p) => isSkin(d[p * 4], d[p * 4 + 1], d[p * 4 + 2], d[p * 4 + 3]);
  // la piel corta el paso salvo en tonos poco saturados: las sombras de un cuello de pelo crema pasan por piel
  const wall = (p) => {
    if (!skinP(p)) return false;
    const r = d[p * 4], gg = d[p * 4 + 1], b = d[p * 4 + 2], mx = Math.max(r, gg, b);
    return (mx - Math.min(r, gg, b)) / mx >= 0.36;
  };
  const cx = Math.round(e ? e.eyeCx : g.faceCx), ny = Math.max(0, g.chin - 2);
  let nl = cx, nr = cx;
  if (skinP(ny * w + cx)) {
    while (nl > 0 && skinP(ny * w + nl - 1)) nl--;
    while (nr < w - 1 && skinP(ny * w + nr + 1)) nr++;
  }
  const half = nr > nl ? Math.max(cx - nl, nr - cx) + 3 : Math.round((e ? e.iod : g.faceW * 0.3) * 0.3);
  const reach = new Uint8Array(w * h);
  const stack = [];
  for (let y = Math.min(h - 1, g.chin + 3); y < Math.min(h, g.chin + 9); y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (solid(p) && !wall(p)) { reach[p] = 1; stack.push(p); }
  }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p / w) | 0;
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > headTop ? p - w : -1, y < h - 1 ? p + w : -1]) {
      if (q >= 0 && !reach[q] && solid(q) && !wall(q)) { reach[q] = 1; stack.push(q); }
    }
  }
  // lo no alcanzado se agrupa en manchas; solo se quitan las que tienen piel o pelo (mandíbula, lóbulo, mechón).
  // Las que no (trozos sueltos de un cuello de pelo crema que el recorte del fondo dejó aislados) se quedan
  const loose = new Uint8Array(w * h);
  for (let y = headTop; y < g.chin; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x;
    if (Math.abs(x - cx) > half && !reach[p] && solid(p)) loose[p] = 1;
  }
  const { lab: ll, boxes: lb } = label(loose, w, h);
  const nSkin = new Int32Array(lb.length), nHair = new Int32Array(lb.length);
  for (let p = 0; p < w * h; p++) {
    if (!ll[p]) continue;
    const r = d[p * 4], gg = d[p * 4 + 1], b = d[p * 4 + 2], a = d[p * 4 + 3];
    if (wall(p)) nSkin[ll[p]]++;
    else if (isHair(r, gg, b, a) || (Math.max(r, gg, b) < 110 && r >= gg && gg >= b)) nHair[ll[p]]++;
  }
  // también los trazos finos y halos sueltos (manchas muy pequeñas o alargadas que llenan poco su caja)
  const stroke = (k) => {
    const bx = lb[k], bw = bx.x1 - bx.x0 + 1, bh = bx.y1 - bx.y0 + 1;
    return bx.size < 40 || (Math.max(bw, bh) > 12 && bx.size / (bw * bh) < 0.2);
  };
  const headish = (k) => nSkin[k] >= lb[k].size * 0.15 || nHair[k] >= lb[k].size * 0.3 || stroke(k);
  for (let p = 0; p < w * h; p++) if (ll[p] && headish(ll[p])) out[p * 4 + 3] = 0;
  return { img: { w, h, data: out }, geom: { w, h, chin: g.chin, faceW: g.faceW, faceCx: g.faceCx, ...(e ?? {}) } };
}

const pngs = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png")).sort() : []);

async function buildStyle(style) {
  const cat = path.join(CATALOG, style);
  const out = path.join(PIECES, style);
  const hairs = pngs(path.join(cat, "hair")), outfits = pngs(path.join(cat, "outfit"));
  if (hairs.length === 0 || outfits.length === 0) return null;
  const m = { style, heads: {}, bodies: {}, pets: {}, grandparents: {}, skins: SKINS, hairColors: HAIR_COLORS };
  for (const f of hairs) {
    const { img, geom } = buildHead(await load(path.join(cat, "hair", f)));
    await savePng(img, path.join(out, "heads", f));
    m.heads[f.slice(0, -4)] = geom;
  }
  for (const f of outfits) {
    const { img, geom } = headless(cutout(await load(path.join(cat, "outfit", f))));
    await savePng(img, path.join(out, "bodies", f));
    m.bodies[f.slice(0, -4)] = geom;
  }
  for (const [src, dst, key] of [["pet", "pets", "pets"], ["grandparent", "grandparents", "grandparents"]]) {
    for (const f of pngs(path.join(cat, src))) {
      const img = cutout(await load(path.join(cat, src, f)));
      await savePng(img, path.join(out, dst, f));
      m[key][f.slice(0, -4)] = { w: img.w, h: img.h };
    }
  }
  // poses y fondos externos (opcionales)
  const raw = path.join(RAW, style);
  const posesDir = path.join(raw, "poses");
  if (fs.existsSync(posesDir)) {
    for (const pose of fs.readdirSync(posesDir).sort()) {
      const pdir = path.join(posesDir, pose);
      if (!fs.statSync(pdir).isDirectory()) continue;
      for (const f of pngs(pdir)) {
        const id = f.slice(0, -4);
        if (!m.bodies[id]) { console.log(`  aviso: ${style}/poses/${pose}/${f} no es una prenda conocida; ignorado`); continue; }
        const { img, geom } = headless(cutout(await load(path.join(pdir, f))));
        await savePng(img, path.join(out, "poses", pose, f));
        (m.poses ??= {})[pose] ??= {};
        m.poses[pose][id] = geom;
      }
    }
  }
  const bgDir = path.join(raw, "backgrounds");
  if (fs.existsSync(bgDir)) {
    const layout = JSON.parse(fs.readFileSync(LAYOUT, "utf8"));
    for (const f of fs.readdirSync(bgDir).sort()) {
      const id = f.replace(/\.[^.]+$/, "");
      if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
      if (!SCENES.includes(id)) { console.log(`  aviso: ${style}/backgrounds/${f} no es una escena conocida; ignorado`); continue; }
      fs.mkdirSync(path.join(out, "backgrounds"), { recursive: true });
      await sharp(path.join(bgDir, f)).resize(BG_W, BG_H, { fit: "cover", position: "centre" }).jpeg({ quality: 82, progressive: true }).toFile(path.join(out, "backgrounds", `${id}.jpg`));
      (m.backgrounds ??= {})[id] = { w: BG_W, h: BG_H, ...layout[id] };
    }
  }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "pieces.json"), JSON.stringify(m, null, 1) + "\n");
  return m;
}

const styles = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(CATALOG).filter((d) => fs.statSync(path.join(CATALOG, d)).isDirectory()).sort();
const built = [];
for (const s of styles) {
  const m = await buildStyle(s);
  if (!m) { console.log(`${s}: catálogo incompleto (faltan hair/ u outfit/), sin piezas`); continue; }
  const n = Object.keys(m.heads).length + Object.keys(m.bodies).length + Object.keys(m.pets).length + Object.keys(m.grandparents).length;
  console.log(`${s}: ${n} piezas · poses ${Object.values(m.poses ?? {}).reduce((a, p) => a + Object.keys(p).length, 0)} · fondos ${Object.keys(m.backgrounds ?? {}).length}`);
  built.push(m);
}
const ts = `// Generado por scripts/pieces-build.mjs (prebuild). No editar a mano.
import type { PiecesManifest } from "./pieces";

export const MANIFESTS: Record<string, PiecesManifest> = ${JSON.stringify(Object.fromEntries(built.map((m) => [m.style, m])), null, 1)};
`;
fs.writeFileSync(path.join(WEB, "lib", "pieces.generated.ts"), ts);
console.log(`lib/pieces.generated.ts: ${built.map((m) => m.style).join(", ") || "ningún estilo"}`);

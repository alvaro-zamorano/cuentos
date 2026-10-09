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
 * Misma lógica que ../scripts/pieces_build.py (que queda como referencia). Recolor de piel y pelo: en cliente (lib/recolor.ts).
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
  const hh = Math.min(h, chin + 6);
  const out = new Uint8ClampedArray(data.subarray(0, hh * w * 4));
  // ropa del bust original bajo la barbilla (tercio inferior): se borra con 1 px de margen, salvo piel y pelo
  const garment = new Uint8Array(w * hh);
  const keep = new Uint8Array(w * hh);
  for (let y = Math.floor(hh * 0.62); y < hh; y++) for (let x = 0; x < w; x++) {
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
    const dil = garment[p] || (x > 0 && garment[p - 1]) || (x < w - 1 && garment[p + 1]) || (y > 0 && garment[p - w]) || (y < hh - 1 && garment[p + w]);
    if (dil && !keep[p]) out[p * 4 + 3] = 0;
  }
  for (let y = hh - 10; y < hh; y++) { const f = (hh - 1 - y) / 9; for (let x = 0; x < w; x++) out[(y * w + x) * 4 + 3] = Math.round(out[(y * w + x) * 4 + 3] * f); }
  const head = { w, h: hh, data: out };
  const g = faceGeom(head, 1);
  return { img: head, geom: { w, h: hh, chin, faceW: g.faceW, faceCx: g.faceCx } };
}

/** Figura entera (fondo ya transparente) → cuerpo sin cabeza + geometría (barbilla, cara). */
function headless(im) {
  const { w, h } = im;
  const g = faceGeom(im, 0.45);
  const headTop = g.chin - 10; // cuello y arranque de la barbilla; por encima va la cabeza nueva
  const out = new Uint8ClampedArray(im.data);
  for (let y = 0; y < headTop; y++) for (let x = 0; x < w; x++) out[(y * w + x) * 4 + 3] = 0;
  for (let y = headTop; y < Math.min(h, headTop + 8); y++) { const f = (y - headTop) / 7; for (let x = 0; x < w; x++) out[(y * w + x) * 4 + 3] = Math.round(out[(y * w + x) * 4 + 3] * f); }
  return { img: { w, h, data: out }, geom: { w, h, chin: headTop, faceW: g.faceW, faceCx: g.faceCx } };
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

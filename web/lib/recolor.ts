/**
 * Recolor de piel y pelo en el navegador (canvas).
 * Las piezas gouache llevan piel melocotón saturada (mediana medida en las piezas: #fda465) y pelo castaño (#7a4a26);
 * aquí se desplazan tono, saturación y luminosidad conservando el sombreado.
 * La máscara de piel es por tono/saturación (HSV): la de scripts/pieces_build.py dejaba sin detectar la cara
 * (g−b > 58) y marcaba como piel las camisas crema; con pieles oscuras salían caras claras y cuerpos a manchas.
 */
const BASE_SKIN = "#fda465";
const BASE_HAIR = "#7a4a26";

function hex2rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgb2hls(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, l, 0];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = 0;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, l, s];
}

function hls2rgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

function isSkin(r: number, g: number, b: number, a: number): boolean {
  if (a < 8) return false;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx !== r || mx === mn) return false;
  const v = mx / 255;
  const s = (mx - mn) / mx;
  const hue = (60 * (g - b)) / (mx - mn); // r es el máximo: tono en grados entre −60 y 60
  // incluye la piel en sombra (más saturada y rojiza) y el rubor de las mejillas; excluye pelo pelirrojo (s > 0.8) y castaño (v < 0.62)
  return hue >= 8 && hue <= 34 && s >= 0.3 && s <= 0.8 && v >= 0.62;
}

/** Piel inequívoca (núcleo de la máscara): se usa para no tratar como pelo los tonos de piel. */
function isSkinCore(r: number, g: number, b: number, a: number): boolean {
  if (a < 8) return false;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx !== r || mx === mn) return false;
  const hue = (60 * (g - b)) / (mx - mn);
  const s = (mx - mn) / mx;
  return hue >= 15 && hue <= 32 && s >= 0.36 && s <= 0.68 && mx / 255 >= 0.78;
}

function isHair(r: number, g: number, b: number, a: number): boolean {
  if (a === 0) return false;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = (mx - mn) / Math.max(mx, 1);
  return r > g && g >= b && r < 200 && r - b > 30 && sat > 0.35 && !isSkinCore(r, g, b, a);
}

export interface RecolorOpts {
  skin?: string | null; // hex objetivo
  hair?: string | null; // hex objetivo; null = castaño original
  /**
   * Máscara del pelo (PNG gris del mismo tamaño, 255 = pelo; la hace scripts/crear_hair_masks.py). Con ella el pelo se
   * tiñe con una rampa sombra → color → luz sobre la luminosidad original, mezclada por la máscara, y la piel no toca el
   * pelo. Sin ella, el recolor por color de cada píxel de siempre.
   */
  hairMask?: string | null;
}

function shift(data: Uint8ClampedArray, test: (r: number, g: number, b: number, a: number) => boolean, baseHex: string, targetHex: string, where?: (i: number) => boolean) {
  const [br, bg, bb] = hex2rgb(baseHex);
  const [tr, tg, tb] = hex2rgb(targetHex);
  const [bh, bl, bs] = rgb2hls(br, bg, bb);
  const [th, tl, ts] = rgb2hls(tr, tg, tb);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (!test(r, g, b, a) || (where && !where(i))) continue;
    const [h, l, s] = rgb2hls(r, g, b);
    const l2 = Math.min(1, Math.max(0, tl * (l / Math.max(bl, 1e-6))));
    const s2 = Math.min(1, Math.max(0, s * (ts / Math.max(bs, 1e-6))));
    const [r2, g2, b2] = hls2rgb(h + (th - bh), l2, s2);
    data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
  }
}

/** Rampa del pelo para un color: sombra (más oscura y hacia el naranja, para que el rubio no se vuelva verdoso), el color y luz. */
function hairRamp(hex: string): [number, number, number][] {
  const [r, g, b] = hex2rgb(hex);
  const [h, l, s] = rgb2hls(r, g, b);
  return [hls2rgb(h - 0.035, l * 0.42, Math.min(1, s * 1.05)), [r, g, b], hls2rgb(h + 0.008, l + (1 - l) * 0.5, s * 0.85)];
}

/** Luminancia (0–255) de cada píxel. */
const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Percentil `q` (0–1) de la luminancia dentro de la máscara, por histograma. */
function lumPercentile(data: Uint8ClampedArray, mask: Uint8ClampedArray, q: number): number {
  const hist = new Array<number>(256).fill(0);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (mask[i] < 128) continue;
    hist[Math.round(lum(data, i))]++;
    n++;
  }
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= q * n) return v;
  }
  return 255;
}

/** Pelo con máscara: rampa de color sobre la luminosidad original, mezclada por la máscara (borde suave). */
function tintHairMasked(data: Uint8ClampedArray, mask: Uint8ClampedArray, targetHex: string) {
  const lo = lumPercentile(data, mask, 0.02);
  const hi = Math.max(lo + 1, lumPercentile(data, mask, 0.98));
  const [shadow, base, light] = hairRamp(targetHex);
  const PIVOT = 0.6; // dónde cae el color elegido en la rampa
  for (let i = 0; i < data.length; i += 4) {
    const a = mask[i] / 255;
    if (a <= 0) continue;
    const t = Math.min(1, Math.max(0, (lum(data, i) - lo) / (hi - lo)));
    const [from, to, k] = t < PIVOT ? [shadow, base, t / PIVOT] : [base, light, (t - PIVOT) / (1 - PIVOT)];
    for (let c = 0; c < 3; c++) data[i + c] = data[i + c] * (1 - a) + (from[c] + (to[c] - from[c]) * k) * a;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`no carga ${src}`));
    img.src = src;
  });
}

const cache = new Map<string, Promise<string>>();

/** Devuelve un data URL de la pieza recoloreada (cacheado por src+opciones). Solo en el navegador. */
export function recolorPiece(src: string, opts: RecolorOpts): Promise<string> {
  const key = `${src}|${opts.skin ?? ""}|${opts.hair ?? ""}|${opts.hairMask ?? ""}`;
  if (!opts.skin && !opts.hair) return Promise.resolve(src);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    let img: HTMLImageElement;
    try {
      img = await loadImage(src);
    } catch {
      return src;
    }
    // sin la máscara (no carga), el recolor de siempre
    const maskImg = opts.hair && opts.hairMask ? await loadImage(opts.hairMask).catch(() => null) : null;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return src;
    ctx.drawImage(img, 0, 0);
    const id = ctx.getImageData(0, 0, c.width, c.height);
    if (maskImg) {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(maskImg, 0, 0, c.width, c.height);
      const mask = ctx.getImageData(0, 0, c.width, c.height).data;
      // la piel primero, fuera del pelo y sobre los colores originales: un rubio o un pelirrojo caen en el tono de la piel
      if (opts.skin) shift(id.data, (r, g, b, a) => isSkin(r, g, b, a), BASE_SKIN, opts.skin, (i) => mask[i] < 128);
      tintHairMasked(id.data, mask, opts.hair!);
    } else {
      if (opts.hair) shift(id.data, isHair, BASE_HAIR, opts.hair);
      if (opts.skin) shift(id.data, isSkin, BASE_SKIN, opts.skin);
    }
    ctx.putImageData(id, 0, 0);
    return c.toDataURL("image/png");
  })();
  cache.set(key, p);
  return p;
}

/**
 * Recolor de piel y pelo en el navegador (canvas). Mismas máscaras que scripts/pieces_build.py.
 * Las piezas base del catálogo llevan piel melocotón (#f3c9a6) y pelo castaño (#7a4a26);
 * aquí se desplazan tono, saturación y luminosidad conservando el sombreado.
 */
const BASE_SKIN = "#f3c9a6";
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
  if (a === 0) return false;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = (mx - mn) / Math.max(mx, 1);
  return r > g && g > b && r - b > 50 && r - b < 140 && r - g > 24 && g - b < 58 && r > 185 && g > 130 && b > 90 && sat > 0.26 && sat < 0.62;
}

function isHair(r: number, g: number, b: number, a: number): boolean {
  if (a === 0) return false;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = (mx - mn) / Math.max(mx, 1);
  return r > g && g >= b && r < 200 && r - b > 30 && sat > 0.35 && !isSkin(r, g, b, a);
}

export interface RecolorOpts {
  skin?: string | null; // hex objetivo
  hair?: string | null; // hex objetivo; null = castaño original
}

function shift(data: Uint8ClampedArray, test: (r: number, g: number, b: number, a: number) => boolean, baseHex: string, targetHex: string) {
  const [br, bg, bb] = hex2rgb(baseHex);
  const [tr, tg, tb] = hex2rgb(targetHex);
  const [bh, bl, bs] = rgb2hls(br, bg, bb);
  const [th, tl, ts] = rgb2hls(tr, tg, tb);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (!test(r, g, b, a)) continue;
    const [h, l, s] = rgb2hls(r, g, b);
    const l2 = Math.min(1, Math.max(0, tl * (l / Math.max(bl, 1e-6))));
    const s2 = Math.min(1, Math.max(0, s * (ts / Math.max(bs, 1e-6))));
    const [r2, g2, b2] = hls2rgb(h + (th - bh), l2, s2);
    data[i] = r2; data[i + 1] = g2; data[i + 2] = b2;
  }
}

const cache = new Map<string, Promise<string>>();

/** Devuelve un data URL de la pieza recoloreada (cacheado por src+opciones). Solo en el navegador. */
export function recolorPiece(src: string, opts: RecolorOpts): Promise<string> {
  const key = `${src}|${opts.skin ?? ""}|${opts.hair ?? ""}`;
  if (!opts.skin && !opts.hair) return Promise.resolve(src);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(src);
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, c.width, c.height);
        if (opts.hair) shift(id.data, isHair, BASE_HAIR, opts.hair);
        if (opts.skin) shift(id.data, isSkin, BASE_SKIN, opts.skin);
        ctx.putImageData(id, 0, 0);
        resolve(c.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
  cache.set(key, p);
  return p;
}

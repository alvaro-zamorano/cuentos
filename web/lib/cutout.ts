/**
 * Quita el fondo blanco de un recorte del catálogo (los PNG son RGB sobre blanco) en el navegador:
 * relleno por inundación desde los bordes con los píxeles casi blancos → transparentes.
 * Devuelve un data URL PNG o null si no se puede (sin canvas, imagen ausente…). Cacheado por src.
 */
const cache = new Map<string, Promise<string | null>>();

export function cutout(src: string): Promise<string | null> {
  const hit = cache.get(src);
  if (hit) return hit;
  const p = new Promise<string | null>((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    const img = new Image();
    img.onload = () => {
      try {
        resolve(removeWhite(img));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  cache.set(src, p);
  return p;
}

function removeWhite(img: HTMLImageElement): string | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const isBg = (i: number) => {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const min = Math.min(r, g, b);
    return min > 226 && Math.max(r, g, b) - min < 28;
  };
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isBg(p * 4)) continue;
    px[p * 4 + 3] = 0;
    const x = p % w;
    const y = (p - x) / w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  // borde suave: píxeles claros pegados al fondo quedan semitransparentes
  for (let p = 0; p < w * h; p++) {
    if (px[p * 4 + 3] === 0) continue;
    const x = p % w;
    const near = (x > 0 && px[(p - 1) * 4 + 3] === 0) || (x < w - 1 && px[(p + 1) * 4 + 3] === 0) || (p >= w && px[(p - w) * 4 + 3] === 0) || (p + w < w * h && px[(p + w) * 4 + 3] === 0);
    if (near && Math.min(px[p * 4], px[p * 4 + 1], px[p * 4 + 2]) > 190) px[p * 4 + 3] = 110;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/png");
}

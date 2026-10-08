import { catalogCrop, type CatalogCrop } from "./catalog";
import { defaultVariant, normalizeTraits } from "./traits";
import type { Companion, Draft, Illustration, StyleId, Traits } from "./types";

/**
 * Edición ilustrada en modo demostración (dry-run, sin coste).
 * Cada página = ancla del estilo recortada a 3:2 + recortes del catálogo superpuestos.
 * Todo es determinista: (estilo, página, variante) → misma composición.
 */

export const DRY_RUN_NOTICE = "Vista previa de demostración: las ilustraciones finales se generan tras el pago";

export function emptyIllustration(): Illustration {
  return { paid: false, buyerDeclaration: false, sheetApproved: false, pages: {} };
}

export function getIllustration(draft: Draft): Illustration {
  return { ...emptyIllustration(), ...(draft.illustration ?? {}), pages: { ...(draft.illustration?.pages ?? {}) } };
}

/** Huella de lo que dibuja la hoja: rasgos del protagonista + estilo. */
export function sheetKey(draft: Draft): string {
  return JSON.stringify([draft.styleId ?? null, normalizeTraits(draft.hero.traits)]);
}

/** Huella de lo que dibujan las páginas: hoja + acompañante. */
export function pagesKey(draft: Draft): string {
  const c = draft.companion;
  return JSON.stringify([sheetKey(draft), c ? [c.kind, c.variant ?? null, c.traits ? normalizeTraits(c.traits) : null] : null]);
}

export function sheetIsValid(draft: Draft): boolean {
  const ill = getIllustration(draft);
  return !!draft.styleId && ill.sheetApproved && ill.sheetKey === sheetKey(draft);
}

/** Páginas ilustradas válidas para el estado actual (si cambian rasgos, estilo o acompañante, se descartan). */
export function validPages(draft: Draft): Illustration["pages"] {
  const ill = getIllustration(draft);
  if (!sheetIsValid(draft) || ill.pagesKey !== pagesKey(draft)) return {};
  return ill.pages;
}

/* ----------------------------- composición ----------------------------- */

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Cajas del niño y de la abuela en cada ancla, en fracción de la imagen (x0, y0, x1, y1).
 * Medidas a ojo sobre una cuadrícula del 10 % (public/styles/<id>.jpg). El avatar se coloca encima del niño.
 */
type Box = [number, number, number, number];
export const ANCHOR_BOXES: Record<StyleId, { child: Box; elder: Box }> = {
  "3d": { child: [0.49, 0.35, 0.7, 0.85], elder: [0.83, 0.4, 0.97, 0.72] },
  flat: { child: [0.5, 0.38, 0.72, 0.87], elder: [0.83, 0.38, 0.97, 0.7] },
  gouache: { child: [0.5, 0.35, 0.7, 0.83], elder: [0.82, 0.35, 0.97, 0.72] },
  papercraft: { child: [0.49, 0.4, 0.72, 0.9], elder: [0.82, 0.43, 0.95, 0.78] },
  lapiz: { child: [0.45, 0.37, 0.65, 0.85], elder: [0.82, 0.37, 0.97, 0.72] },
  acuarela: { child: [0.46, 0.42, 0.66, 0.9], elder: [0.82, 0.35, 0.97, 0.7] },
};

/** Figura superpuesta, en % del marco 3:2: centro horizontal, borde inferior y alto. */
export interface Placement {
  centerX: number;
  bottom: number;
  height: number;
  flip: boolean;
}

export interface PageLayout {
  /** Zoom sobre el ancla (≥1), ventana visible del ancla (fracciones) y espejo horizontal del fondo. */
  zoom: number;
  originX: number;
  originY: number;
  mirror: boolean;
  hero: Placement;
  /** "elder" = tapa a la abuela del ancla (abuelos, busto); "ground" = en el suelo junto al niño (mascota, hermano/a). */
  companion: { elder: Placement; ground: Placement };
}

export function pageLayout(styleId: StyleId, n: number, variant: number): PageLayout {
  const h = hash(`${styleId}:${n}:${variant}`);
  const boxes = ANCHOR_BOXES[styleId];
  const mirror = (h >>> 3) % 2 === 1;
  const mx = (b: Box): Box => (mirror ? [1 - b[2], b[1], 1 - b[0], b[3]] : b);
  const child = mx(boxes.child);
  const elder = mx(boxes.elder);
  const childW = child[2] - child[0];
  const childH = child[3] - child[1];
  // hueco para una mascota o un hermano en el suelo, en el lado contrario a la abuela
  const groundW = childW * 0.9;
  const groundLeftOfChild = elder[0] > child[0];
  const unionX0 = Math.min(child[0], elder[0], groundLeftOfChild ? child[0] - groundW : child[0]);
  const unionX1 = Math.max(child[2], elder[2], groundLeftOfChild ? child[2] : child[2] + groundW);
  const unionY0 = Math.min(child[1], elder[1]) - 0.06;
  const unionY1 = Math.min(1, child[3] + 0.05);
  const maxZoom = Math.max(1, Math.min(1 / (unionX1 - unionX0 + 0.02), 1 / (unionY1 - unionY0 + 0.02)));
  const zoom = 1 + ((h % 1000) / 1000) * (maxZoom - 1);
  const win = 1 / zoom;
  const pick = (lo: number, hi: number, r: number) => (hi <= lo ? Math.max(0, Math.min(1 - win, lo)) : lo + r * (hi - lo));
  const originX = pick(Math.max(0, unionX1 - win), Math.min(1 - win, unionX0), ((h >>> 11) % 1000) / 1000);
  const originY = pick(Math.max(0, unionY1 - win), Math.min(1 - win, unionY0), ((h >>> 21) % 1000) / 1000);
  const toX = (x: number) => (x - originX) * zoom * 100;
  const toY = (y: number) => (y - originY) * zoom * 100;
  const heroFlip = ((h >>> 7) % 2 === 1) !== mirror;
  const groundCenter = groundLeftOfChild ? child[0] - groundW * 0.35 : child[2] + groundW * 0.35;
  return {
    zoom,
    originX,
    originY,
    mirror,
    hero: {
      centerX: toX((child[0] + child[2]) / 2),
      bottom: 100 - toY(child[3] + 0.015),
      height: childH * 1.18 * zoom * 100,
      flip: heroFlip,
    },
    companion: {
      elder: { centerX: toX((elder[0] + elder[2]) / 2), bottom: 100 - toY(elder[3] + 0.02), height: (elder[3] - elder[1]) * 1.12 * zoom * 100, flip: !groundLeftOfChild },
      ground: { centerX: toX(groundCenter), bottom: 100 - toY(child[3] + 0.01), height: childH * 0.62 * zoom * 100, flip: !groundLeftOfChild },
    },
  };
}

/** Recorte de cuerpo entero del protagonista (outfit del catálogo). */
export function heroCrop(styleId: StyleId, traits: Traits): CatalogCrop {
  return catalogCrop(styleId, "outfit", normalizeTraits(traits).garment ?? "jersey");
}

/** Recorte del acompañante: mascota o abuelo del catálogo; hermano/a = su prenda. */
export function companionCrop(styleId: StyleId, companion: Companion | undefined): (CatalogCrop & { slot: "elder" | "ground" }) | null {
  if (!companion) return null;
  const variant = companion.variant ?? defaultVariant(companion.kind);
  if ((companion.kind === "perro" || companion.kind === "gato") && variant) return { ...catalogCrop(styleId, "pet", variant), slot: "ground" };
  if ((companion.kind === "abuela" || companion.kind === "abuelo") && variant) return { ...catalogCrop(styleId, "grandparent", variant), slot: "elder" };
  if (companion.traits) return { ...catalogCrop(styleId, "outfit", normalizeTraits(companion.traits).garment ?? "jersey"), slot: "ground" };
  return null;
}

/* ------------------------- adaptador dry-run (cliente) ------------------------- */

/**
 * «Genera» una página en dry-run: tarda 300–800 ms (determinista por página y variante)
 * y devuelve la variante. No llama a ningún proveedor.
 */
export async function dryRunIllustratePage(styleId: StyleId, n: number, variant = 0, signal?: AbortSignal): Promise<{ variant: number; ms: number }> {
  const ms = 300 + (hash(`delay:${styleId}:${n}:${variant}`) % 501);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("abort", "AbortError"));
    });
  });
  return { variant, ms };
}

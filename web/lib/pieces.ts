import gouache from "@/public/pieces/gouache/pieces.json";
import { HAIR_COLORS, SKINS, defaultVariant, normalizeTraits } from "./traits";
import type { Companion, StyleId, Traits } from "./types";

/**
 * Piezas pintadas (marioneta): cabezas y cuerpos recortados del catálogo del estilo,
 * con geometría para alinear barbilla y centro de la cara. Generado por scripts/pieces_build.py.
 */
export interface PieceGeom {
  w: number;
  h: number;
  chin: number;
  faceW: number;
  faceCx: number;
}
export interface PiecesManifest {
  style: string;
  heads: Record<string, PieceGeom>;
  bodies: Record<string, PieceGeom>;
  pets: Record<string, { w: number; h: number }>;
  grandparents: Record<string, { w: number; h: number }>;
  skins: string[];
  hairColors: string[];
}

const MANIFESTS: Partial<Record<StyleId, PiecesManifest>> = { gouache: gouache as PiecesManifest };

export function piecesFor(style: StyleId | undefined | null): PiecesManifest | null {
  return (style && MANIFESTS[style]) || null;
}

/** Estilo por defecto con piezas (el Clásico pintado). */
export const DEFAULT_PAINTED_STYLE: StyleId = "gouache";

export interface FigureSpec {
  bodySrc: string;
  headSrc: string;
  /** Hex de piel y pelo objetivo para el recolor en cliente (null = base). */
  skinHex: string | null;
  hairHex: string | null;
  body: PieceGeom;
  head: PieceGeom;
  /** Escala de la cabeza respecto al cuerpo y posición de la cabeza en el marco del cuerpo. */
  headScale: number;
  headX: number;
  headY: number;
}

/** Resuelve las piezas de un niño (protagonista o hermano/a) para un estilo. */
export function figureFor(style: StyleId, traits: Traits | undefined): FigureSpec | null {
  const m = piecesFor(style);
  if (!m) return null;
  const t = normalizeTraits(traits);
  const bodyId = m.bodies[t.garment ?? "jersey"] ? (t.garment ?? "jersey") : Object.keys(m.bodies)[0];
  const hairId = m.heads[t.hair.shape] ? t.hair.shape : Object.keys(m.heads)[0];
  const body = m.bodies[bodyId];
  const head = m.heads[hairId];
  const headScale = body.faceW / head.faceW;
  const skinHex = SKINS.find((s) => s.id === t.skin)?.hex ?? null;
  const hairHex = t.hair.color === "castano" ? null : HAIR_COLORS.find((h) => h.id === t.hair.color)?.hex ?? null;
  return {
    bodySrc: `/pieces/${style}/bodies/${bodyId}.png`,
    headSrc: `/pieces/${style}/heads/${hairId}.png`,
    skinHex,
    hairHex,
    body,
    head,
    headScale,
    headX: body.faceCx - head.faceCx * headScale,
    // +7: el degradado inferior de la cabeza se solapa con la parte ya opaca del cuello (si no, queda una línea clara)
    headY: body.chin - head.chin * headScale + 7,
  };
}

export interface CompanionSpec {
  src: string;
  w: number;
  h: number;
  /** Bust (abuelos): no tiene pies, se apoya sobre algo o se recorta por abajo. */
  bust: boolean;
}

export function companionFor(style: StyleId, c: Companion | undefined): CompanionSpec | FigureSpec | null {
  if (!c) return null;
  const m = piecesFor(style);
  if (!m) return null;
  if (c.kind === "hermano" || c.kind === "hermana") return figureFor(style, c.traits);
  const variant = c.variant ?? defaultVariant(c.kind);
  if (!variant) return null;
  if (c.kind === "perro" || c.kind === "gato") {
    const g = m.pets[variant];
    return g ? { src: `/pieces/${style}/pets/${variant}.png`, w: g.w, h: g.h, bust: false } : null;
  }
  const g = m.grandparents[variant];
  return g ? { src: `/pieces/${style}/grandparents/${variant}.png`, w: g.w, h: g.h, bust: true } : null;
}

export function isFigure(x: CompanionSpec | FigureSpec | null): x is FigureSpec {
  return !!x && "bodySrc" in x;
}

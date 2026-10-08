import type { StyleId } from "./types";

/**
 * Recortes del catálogo de rasgos por estilo: `public/catalog/<estilo>/<categoria>/<id>.png`.
 * Disponibilidad copiada de `assets/manifest.json` (→ `huecos`); si se regenera el manifest, actualízala aquí.
 */
export type CatalogCategory = "hair" | "skin" | "eyes" | "glasses" | "outfit" | "accessory" | "pet" | "grandparent";

export const CATALOG_GAPS: { style: StyleId; category: CatalogCategory }[] = [
  { style: "3d", category: "hair" },
  { style: "papercraft", category: "hair" },
  { style: "acuarela", category: "hair" },
  { style: "acuarela", category: "outfit" },
];

/** Estilos más parecidos, en orden, para cubrir un hueco (criterio: técnica y acabado de las anclas). */
export const SIMILAR_STYLES: Record<StyleId, StyleId[]> = {
  "3d": ["flat", "papercraft", "gouache", "lapiz", "acuarela"],
  flat: ["papercraft", "3d", "gouache", "lapiz", "acuarela"],
  papercraft: ["flat", "3d", "gouache", "lapiz", "acuarela"],
  gouache: ["acuarela", "lapiz", "flat", "papercraft", "3d"],
  lapiz: ["acuarela", "gouache", "flat", "papercraft", "3d"],
  acuarela: ["lapiz", "gouache", "flat", "papercraft", "3d"],
};

export function hasCategory(style: StyleId, category: CatalogCategory): boolean {
  return !CATALOG_GAPS.some((g) => g.style === style && g.category === category);
}

export interface CatalogCrop {
  src: string;
  /** Estilo del que sale el recorte (distinto del pedido si había hueco). */
  fromStyle: StyleId;
  /** true si el recorte es de otro estilo: se marca como «provisional» en pantalla. */
  provisional: boolean;
}

export function catalogCrop(style: StyleId, category: CatalogCategory, id: string): CatalogCrop {
  const from = hasCategory(style, category) ? style : SIMILAR_STYLES[style].find((s) => hasCategory(s, category)) ?? "flat";
  return { src: `/catalog/${from}/${category}/${id}.png`, fromStyle: from, provisional: from !== style };
}

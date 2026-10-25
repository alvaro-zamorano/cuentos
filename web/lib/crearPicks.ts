/**
 * Opciones con imagen del paso 2 de /crear (miniaturas en public/crear, generadas con scripts/crear-thumbs.mjs desde
 * el catálogo gouache). La ropa y las mascotas rellenan el texto libre con lo que se ve en la miniatura, para que el
 * libro pinte lo mismo que el padre ha elegido; el texto se puede retocar después.
 */
import { GARMENTS, GLASSES, HAIR_SHAPES, PETS } from "./traits";

export interface Pick {
  id: string;
  label: string;
  src: string;
  /** Máscara del pelo de la miniatura (solo peinados): ver scripts/crear_hair_masks.py. */
  mask?: string;
}

export const HAIR_PICKS: Pick[] = HAIR_SHAPES.map((h) => ({ id: h.id, label: h.label, src: `/crear/hair/${h.id}.webp`, mask: `/crear/hair/${h.id}.mask.png` }));

export const GLASSES_PICKS: Pick[] = GLASSES.map((g) => ({ id: g.id, label: g.label, src: `/crear/glasses/${g.id}.webp` }));

/** Texto de «Ropa de siempre» que describe lo que enseña cada miniatura. */
const OUTFIT_TEXT: Record<string, string> = {
  chubasquero: "chubasquero amarillo y botas de agua azules",
  peto: "peto rojo con camisa blanca",
  jersey: "jersey azul y pantalón amarillo",
  marinera: "camiseta de rayas y pantalón corto azul",
  vestido: "vestido amarillo de flores con leggings azules",
  plumifero: "plumífero rojo con capucha de borreguito",
  pijama: "pijama azul de estrellas",
  verano: "camiseta amarilla y bañador azul",
};

/**
 * Guiones blandos para las etiquetas que no caben enteras en las tarjetas de ropa (cuatro por fila en el móvil): sin
 * ellos, «Chubasquero» se partía por cualquier letra.
 */
const SOFT_HYPHENS: Record<string, string> = { Chubasquero: "Chubas\u00adquero", Camiseta: "Cami\u00adseta", Plumífero: "Plumí\u00adfero" };
const hyphenate = (label: string) => label.replace(/\p{L}+/gu, (w) => SOFT_HYPHENS[w] ?? w);

export const OUTFIT_PICKS: (Pick & { text: string })[] = GARMENTS.map((g) => ({ id: g.id, label: hyphenate(g.label), src: `/crear/outfit/${g.id}.webp`, text: OUTFIT_TEXT[g.id] }));

/** Texto de «Cómo es» y relación por defecto de cada mascota. */
const PET_TEXT: Record<string, { text: string; relation: string }> = {
  corgi: { text: "corgi naranja y blanco", relation: "su perro" },
  golden: { text: "golden retriever cachorro, dorado y muy peludo", relation: "su perro" },
  manchado: { text: "perro blanco con manchas marrones y orejas caídas", relation: "su perro" },
  atigrado: { text: "gato atigrado marrón con el pecho blanco", relation: "su gato" },
  blanquinegro: { text: "gato blanco y negro", relation: "su gato" },
  conejo: { text: "conejo marrón claro de orejas largas", relation: "su conejo" },
  cobaya: { text: "cobaya marrón, naranja y blanca", relation: "su cobaya" },
  periquito: { text: "periquito verde y amarillo", relation: "su periquito" },
};

export const PET_PICKS: (Pick & { text: string; relation: string })[] = PETS.map((p) => ({ id: p.id, label: p.label, src: `/crear/pet/${p.id}.webp`, ...PET_TEXT[p.id] }));

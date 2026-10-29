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

/**
 * Personas de ejemplo para «Quién más sale» (26 oct): solo dan contexto al elegir. Como en las mascotas, la miniatura
 * rellena «Cómo es» con lo que se ve y la relación si está vacía; el texto se puede retocar. Abuelos de unos 60 y
 * activos (GRANDPARENT_RULE): las piezas de abuelos del catálogo eran más mayores.
 */
export const PERSON_PICKS: (Pick & { text: string; relation: string })[] = [
  // una de cada: abuelo, abuela, mamá, papá, hermana y bebé (Álvaro, 29 oct)
  { id: "abuelo", label: "Abuelo", text: "pelo gris corto, barba corta gris, piel morena y jersey azul marino con cremallera", relation: "su abuelo" },
  { id: "abuela", label: "Abuela", text: "media melena gris, piel morena clara, pendientes pequeños y camisa vaquera", relation: "su abuela" },
  { id: "madre-rizos", label: "Mamá", text: "melena rizada negra, piel morena y camiseta verde", relation: "su mamá" },
  { id: "padre-barba", label: "Papá", text: "pelo castaño corto, barba corta castaña, piel clara y camisa de cuadros rojos y azules", relation: "su papá" },
  { id: "hermana", label: "Hermana", text: "niña de unos 8 años con coleta alta castaña clara, piel clara y camiseta roja", relation: "su hermana" },
  // «su hermanito» cuenta como familia del padre (lib/plan/validate.ts): «el bebé de la casa» no, y el cuento podía
  // fallar si el modelo lo llamaba hermanito (revisión independiente)
  { id: "bebe", label: "Bebé", text: "bebé de un año con un mechón de pelo claro, piel clara y pelele amarillo", relation: "su hermanito" },
].map((p) => ({ ...p, src: `/crear/person/${p.id}.webp` }));

/** Los ejemplos con imagen de «Quién más sale», personas y mascotas. */
const CAST_EXAMPLES = [...PET_PICKS, ...PERSON_PICKS];

/** ¿Es el texto de algún ejemplo (persona o mascota)? */
export const isExampleLook = (look: string): boolean => CAST_EXAMPLES.some((p) => p.text === look);

/** ¿Es la relación de algún ejemplo? (la puso un ejemplo, no el padre) */
export const isExampleRelation = (relation: string): boolean => CAST_EXAMPLES.some((p) => p.relation === relation.trim());

interface CastFields {
  kind: string;
  look: string;
  relation: string;
}

/**
 * Pulsar un ejemplo: pone su texto y su relación; un segundo toque lo quita. La relación solo cambia si está vacía o la
 * puso otro ejemplo (revisión independiente: de Abuela a Abuelo se quedaba «su abuela»); la que escribió el padre, no.
 */
export function pickCastExample<T extends CastFields>(c: T, pick: { text: string; relation: string }): T {
  if (c.look === pick.text) return { ...c, look: "", relation: c.relation.trim() === pick.relation ? "" : c.relation };
  return { ...c, look: pick.text, relation: !c.relation.trim() || isExampleRelation(c.relation) ? pick.relation : c.relation };
}

/** Cambiar entre persona y mascota: lo que puso un ejemplo se vacía (una mascota no se queda «su abuela»). */
export function switchCastKind<T extends CastFields>(c: T, kind: T["kind"]): T {
  if (c.kind === kind) return c;
  return { ...c, kind, look: isExampleLook(c.look) ? "" : c.look, relation: isExampleRelation(c.relation) ? "" : c.relation };
}

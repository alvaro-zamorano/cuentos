import type {
  Accessory,
  Companion,
  CompanionKind,
  EyeShape,
  Eyes,
  Garment,
  Glasses,
  GrandparentId,
  HairColor,
  HairShape,
  Outfit,
  PetId,
  Skin,
  SpecialId,
  Traits,
} from "./types";

/**
 * Catálogo cerrado de rasgos (RF-1). Los ids coinciden con los recortes de
 * `public/catalog/<estilo>/<categoria>/<id>.png` (ver assets/manifest.json).
 * `en` es la descripción que se redeclara en los prompts de la edición ilustrada.
 */

// Orden = catálogo de 12 peinados (short straight, bob, long straight, pigtails, short curly, curly bob,
// long curly, afro, braids, buzz cut, wavy medium, bun). Los 8 ids originales se mantienen.
export const HAIR_SHAPES: { id: HairShape; label: string; en: string }[] = [
  { id: "corto", label: "Corto", en: "short straight" },
  { id: "flequillo", label: "Melenita con flequillo", en: "chin-length bob with bangs" },
  { id: "melena", label: "Melena", en: "long straight" },
  { id: "coleta", label: "Coletas", en: "two pigtails" },
  { id: "rizos", label: "Rizos cortos", en: "short curly" },
  { id: "rizos-media", label: "Rizos media melena", en: "curly bob" },
  { id: "rizos-largos", label: "Rizos largos", en: "long curly" },
  { id: "afro", label: "Afro", en: "rounded afro" },
  { id: "trenzas", label: "Trenzas", en: "two braids" },
  { id: "rapado", label: "Rapado", en: "buzz cut" },
  { id: "ondulado", label: "Ondulado", en: "wavy shoulder-length" },
  { id: "mono", label: "Moño", en: "top bun" },
];

export const HAIR_COLORS: { id: HairColor; label: string; hex: string; en: string }[] = [
  { id: "negro", label: "Negro", hex: "#2b2118", en: "black" },
  { id: "castano", label: "Castaño", hex: "#6b4423", en: "chestnut brown" },
  { id: "rubio", label: "Rubio", hex: "#e8c470", en: "blond" },
  { id: "pelirrojo", label: "Pelirrojo", hex: "#d2602c", en: "ginger red" },
  { id: "caoba", label: "Caoba", hex: "#8c3b2e", en: "auburn" },
];

// Orden = catálogo S01–S08 (de más clara a más oscura). Los 5 ids originales conservan su color.
export const SKINS: { id: Skin; label: string; hex: string; en: string }[] = [
  { id: "muy-clara", label: "Muy clara", hex: "#fde6d6", en: "very fair" },
  { id: "clara", label: "Clara", hex: "#f4cfae", en: "fair" },
  { id: "melocoton", label: "Melocotón", hex: "#ebbd94", en: "light peach" },
  { id: "media", label: "Media", hex: "#d9a070", en: "medium" },
  { id: "tostada", label: "Tostada", hex: "#c48a5c", en: "tan" },
  { id: "morena", label: "Morena", hex: "#a86c44", en: "brown" },
  { id: "morena-oscura", label: "Morena oscura", hex: "#8a5434", en: "dark brown" },
  { id: "oscura", label: "Oscura", hex: "#6a3f27", en: "deep brown" },
];

/** Color de ojos. */
export const EYES: { id: Eyes; label: string; hex: string; en: string }[] = [
  { id: "marron", label: "Marrones", hex: "#4a2f1a", en: "brown" },
  { id: "verde", label: "Verdes", hex: "#3f7a4a", en: "green" },
  { id: "azul", label: "Azules", hex: "#3a6fb0", en: "blue" },
  { id: "gris", label: "Grises", hex: "#6b6f78", en: "grey" },
];

/** Forma de ojos. Orden = catálogo E01–E06. */
export const EYE_SHAPES: { id: EyeShape; label: string; en: string }[] = [
  { id: "puntos", label: "Puntitos", en: "small dot" },
  { id: "redondos", label: "Redondos", en: "big round" },
  { id: "ovalados", label: "Ovalados", en: "tall oval" },
  { id: "dormilones", label: "Dormilones", en: "sleepy half-closed" },
  { id: "cerrados", label: "Cerrados", en: "gently closed" },
  { id: "risuenos", label: "Risueños", en: "smiling crescent" },
];

/** Gafas. Orden = catálogo G01–G06 tras "no". */
export const GLASSES: { id: Glasses; label: string; en: string }[] = [
  { id: "no", label: "Sin gafas", en: "" },
  { id: "redondas", label: "Redondas", en: "thin round wire glasses" },
  { id: "redondas-gruesas", label: "Redondas gruesas", en: "thick round navy glasses" },
  { id: "ovaladas", label: "Ovaladas", en: "oval brown glasses" },
  { id: "cuadradas", label: "Cuadradas", en: "rectangular glasses" },
  { id: "pasta", label: "De pasta", en: "thick tortoiseshell glasses" },
  { id: "transparentes", label: "Transparentes", en: "clear transparent glasses" },
];

/** Color de la ropa. */
export const OUTFITS: { id: Outfit; label: string; hex: string; dark: string; en: string }[] = [
  { id: "amarillo", label: "Amarillo", hex: "#f6c445", dark: "#d9a420", en: "yellow" },
  { id: "rojo", label: "Rojo", hex: "#e4573d", dark: "#b93f2a", en: "red" },
  { id: "verde", label: "Verde", hex: "#5aa469", dark: "#3f8450", en: "green" },
  { id: "azul", label: "Azul", hex: "#4a86c9", dark: "#2f66a3", en: "blue" },
  { id: "lila", label: "Lila", hex: "#9b7fd0", dark: "#7a5fb0", en: "lilac" },
  { id: "naranja", label: "Naranja", hex: "#f0924a", dark: "#cc7430", en: "orange" },
];

/** Prenda. Orden = catálogo O01–O08. */
export const GARMENTS: { id: Garment; label: string; en: string }[] = [
  { id: "chubasquero", label: "Chubasquero", en: "hooded raincoat with rain boots" },
  { id: "peto", label: "Peto", en: "dungarees over a cream shirt" },
  { id: "jersey", label: "Jersey", en: "knitted sweater and trousers" },
  { id: "marinera", label: "Camiseta de rayas", en: "striped sailor top and shorts" },
  { id: "vestido", label: "Vestido", en: "dress" },
  { id: "plumifero", label: "Plumífero", en: "puffy winter jacket" },
  { id: "pijama", label: "Pijama", en: "pyjamas with little stars" },
  { id: "verano", label: "De verano", en: "t-shirt and swim shorts" },
];

/** Accesorio (opcional). Orden = catálogo A01–A08 tras "no". */
export const ACCESSORIES: { id: Accessory; label: string; en: string }[] = [
  { id: "no", label: "Nada", en: "" },
  { id: "gorro", label: "Gorro", en: "a pom-pom beanie" },
  { id: "diadema", label: "Diadema", en: "a knotted headband" },
  { id: "mochila", label: "Mochila", en: "a red backpack" },
  { id: "sombrero", label: "Sombrero", en: "a straw sun hat" },
  { id: "bufanda", label: "Bufanda", en: "a scarf" },
  { id: "lazo", label: "Lazo", en: "a hair bow" },
  { id: "casco", label: "Casco", en: "a blue bike helmet" },
  { id: "bolso", label: "Bolso", en: "a small crossbody bag" },
];

/**
 * Mascotas. Orden = catálogo P01–P08. `kind` decide el texto del arco (variante textPet).
 * Conejo, cobaya y periquito están en el catálogo pero `kind: null`: el arco de cumpleaños
 * habla de hocico y cola, así que no se ofrecen como acompañante hasta tener texto para ellos.
 */
export const PETS: { id: PetId; kind: "perro" | "gato" | null; label: string; en: string }[] = [
  { id: "corgi", kind: "perro", label: "Corgi", en: "a corgi puppy, orange and white" },
  { id: "golden", kind: "perro", label: "Golden", en: "a fluffy golden retriever puppy" },
  { id: "manchado", kind: "perro", label: "Con manchas", en: "a white puppy with brown patches and floppy ears" },
  { id: "atigrado", kind: "gato", label: "Atigrado", en: "a striped tabby kitten" },
  { id: "blanquinegro", kind: "gato", label: "Blanco y negro", en: "a black and white tuxedo kitten" },
  { id: "conejo", kind: null, label: "Conejo", en: "a light brown bunny" },
  { id: "cobaya", kind: null, label: "Cobaya", en: "a tricolour guinea pig" },
  { id: "periquito", kind: null, label: "Periquito", en: "a green and yellow budgie" },
];

/** Abuelos. Arquetipos que se mapean a cada catálogo B01–B08 (el orden cambia por estilo, ver manifest). */
export const GRANDPARENTS: { id: GrandparentId; kind: "abuela" | "abuelo"; label: string; en: string }[] = [
  { id: "abuela-mono", kind: "abuela", label: "Con moño", en: "a grandmother with white hair in a bun" },
  { id: "abuela-rizos", kind: "abuela", label: "Rizos grises", en: "a grandmother with curly grey hair, round glasses and brown skin" },
  { id: "abuela-ondas", kind: "abuela", label: "Pelo blanco ondulado", en: "a grandmother with short wavy white hair" },
  { id: "abuela-gafas", kind: "abuela", label: "Con gafas", en: "a grandmother with a grey bob and glasses" },
  { id: "abuelo-calvo", kind: "abuelo", label: "Calvo", en: "a bald grandfather with white side hair and round glasses" },
  { id: "abuelo-barba", kind: "abuelo", label: "Con barba", en: "a grandfather with a grey beard and brown skin" },
  { id: "abuelo-gafas", kind: "abuelo", label: "Con gafas", en: "a grandfather with grey hair and glasses" },
  { id: "abuelo-gris", kind: "abuelo", label: "Pelo gris", en: "a grandfather with neat grey hair" },
];

export const COMPANIONS: { id: CompanionKind; label: string; article: string; needsTraits: boolean; en: string }[] = [
  { id: "perro", label: "Su perro", article: "su perro", needsTraits: false, en: "dog" },
  { id: "gato", label: "Su gato", article: "su gato", needsTraits: false, en: "cat" },
  { id: "abuela", label: "La abuela", article: "la abuela", needsTraits: false, en: "grandmother" },
  { id: "abuelo", label: "El abuelo", article: "el abuelo", needsTraits: false, en: "grandfather" },
  { id: "hermano", label: "Su hermano", article: "su hermano", needsTraits: true, en: "older brother" },
  { id: "hermana", label: "Su hermana", article: "su hermana", needsTraits: true, en: "older sister" },
];

export const PET_KINDS: CompanionKind[] = ["perro", "gato"];

/** Variantes de catálogo disponibles para un tipo de acompañante. */
export function companionVariants(kind: CompanionKind): { id: PetId | GrandparentId; label: string }[] {
  if (kind === "abuela" || kind === "abuelo") return GRANDPARENTS.filter((g) => g.kind === kind);
  return PETS.filter((p) => p.kind === kind);
}

export function defaultVariant(kind: CompanionKind): PetId | GrandparentId | undefined {
  return companionVariants(kind)[0]?.id;
}

export const SPECIALS: { id: SpecialId; label: string; phrase: string; gift: string; emoji: string }[] = [
  { id: "peluche", label: "Su peluche", phrase: "su peluche favorito", gift: "un peluche gigante, hermano mayor del suyo", emoji: "🧸" },
  { id: "dinosaurios", label: "Dinosaurios", phrase: "los dinosaurios", gift: "un dinosaurio verde con la boca abierta", emoji: "🦕" },
  { id: "chocolate", label: "Chocolate", phrase: "el chocolate", gift: "una caja enorme de bombones de chocolate", emoji: "🍫" },
  { id: "estrellas", label: "Las estrellas", phrase: "las estrellas", gift: "una lámpara que llena el techo de estrellas", emoji: "⭐" },
  { id: "coches", label: "Coches", phrase: "los coches de carreras", gift: "un coche de carreras rojo con alerón", emoji: "🏎️" },
  { id: "mariposas", label: "Mariposas", phrase: "las mariposas", gift: "una cometa con forma de mariposa", emoji: "🦋" },
];

export const DEFAULT_TRAITS: Traits = {
  hair: { shape: "rizos", color: "castano" },
  skin: "clara",
  eyes: "marron",
  eyeShape: "puntos",
  glasses: "no",
  outfit: "amarillo",
  garment: "jersey",
  accessory: "no",
};

/** Completa los campos opcionales (borradores anteriores a la Fase 1.5 no los tienen). */
export function normalizeTraits(t: Partial<Traits> | undefined): Traits {
  const base = { ...DEFAULT_TRAITS, ...(t ?? {}) } as Traits;
  const valid = <T extends string>(list: { id: T }[], v: string | undefined, d: T): T =>
    list.some((x) => x.id === v) ? (v as T) : d;
  return {
    hair: {
      shape: valid(HAIR_SHAPES, base.hair?.shape, DEFAULT_TRAITS.hair.shape),
      color: valid(HAIR_COLORS, base.hair?.color, DEFAULT_TRAITS.hair.color),
    },
    skin: valid(SKINS, base.skin, DEFAULT_TRAITS.skin),
    eyes: valid(EYES, base.eyes, DEFAULT_TRAITS.eyes),
    eyeShape: valid(EYE_SHAPES, base.eyeShape, "puntos"),
    glasses: valid(GLASSES, base.glasses, "no"),
    outfit: valid(OUTFITS, base.outfit, DEFAULT_TRAITS.outfit),
    garment: valid(GARMENTS, base.garment, "jersey"),
    accessory: valid(ACCESSORIES, base.accessory, "no"),
  };
}

export function randomTraits(seed = Date.now()): Traits {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  return {
    hair: { shape: pick(HAIR_SHAPES).id, color: pick(HAIR_COLORS).id },
    skin: pick(SKINS).id,
    eyes: pick(EYES).id,
    // las formas abiertas son las más legibles como "ojos por defecto"
    eyeShape: pick(EYE_SHAPES.slice(0, 3)).id,
    glasses: rnd() < 0.25 ? pick(GLASSES.slice(1)).id : "no",
    outfit: pick(OUTFITS).id,
    garment: pick(GARMENTS.filter((g) => g.id !== "pijama")).id,
    accessory: rnd() < 0.2 ? pick(ACCESSORIES.slice(1)).id : "no",
  };
}

export function hex<T extends { id: string; hex: string }>(list: T[], id: string): string {
  return list.find((x) => x.id === id)?.hex ?? list[0].hex;
}

function label<T extends { id: string; label: string }>(list: T[], id: string | undefined): string {
  return (list.find((x) => x.id === id) ?? list[0]).label.toLowerCase();
}

function en<T extends { id: string; en: string }>(list: T[], id: string | undefined): string {
  return (list.find((x) => x.id === id) ?? list[0]).en;
}

/** Descripción en castellano (para mostrar). */
export function describeTraits(input: Traits): string {
  const t = normalizeTraits(input);
  const glasses = t.glasses === "no" ? "" : `, gafas ${label(GLASSES, t.glasses)}`;
  const acc = t.accessory === "no" ? "" : `, ${label(ACCESSORIES, t.accessory)}`;
  return `pelo ${label(HAIR_SHAPES, t.hair.shape)} ${label(HAIR_COLORS, t.hair.color)}, piel ${label(SKINS, t.skin)}, ojos ${label(EYE_SHAPES, t.eyeShape)} ${label(EYES, t.eyes)}${glasses}, ${label(GARMENTS, t.garment)} ${label(OUTFITS, t.outfit)}${acc}`;
}

/** Descripción en inglés para redeclarar en cada prompt de la edición ilustrada (RF-10). */
export function describeTraitsEn(input: Traits): string {
  const t = normalizeTraits(input);
  const parts = [
    `${en(HAIR_SHAPES, t.hair.shape)} ${en(HAIR_COLORS, t.hair.color)} hair`,
    `${en(SKINS, t.skin)} skin`,
    `${en(EYE_SHAPES, t.eyeShape)} ${en(EYES, t.eyes)} eyes`,
  ];
  if (t.glasses !== "no") parts.push(en(GLASSES, t.glasses));
  parts.push(`wearing a ${en(OUTFITS, t.outfit)} ${en(GARMENTS, t.garment)}`);
  if (t.accessory !== "no") parts.push(`with ${en(ACCESSORIES, t.accessory)}`);
  return parts.join(", ");
}

/** Descripción en inglés del acompañante para los prompts. */
export function describeCompanionEn(c: Companion): string {
  if (c.kind === "hermano" || c.kind === "hermana") {
    return `${en(COMPANIONS, c.kind)}: ${describeTraitsEn(c.traits ?? DEFAULT_TRAITS)}`;
  }
  const variant = c.variant ?? defaultVariant(c.kind);
  const fromPets = PETS.find((p) => p.id === variant && p.kind === c.kind);
  if (fromPets) return fromPets.en;
  const fromGp = GRANDPARENTS.find((g) => g.id === variant && g.kind === c.kind);
  if (fromGp) return fromGp.en;
  return `a ${en(COMPANIONS, c.kind)}`;
}

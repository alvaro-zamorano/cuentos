export type HairShape =
  | "corto"
  | "flequillo"
  | "melena"
  | "coleta"
  | "rizos"
  | "rizos-media"
  | "rizos-largos"
  | "afro"
  | "trenzas"
  | "rapado"
  | "ondulado"
  | "mono";
export type HairColor = "negro" | "castano" | "rubio" | "pelirrojo" | "caoba";
export type Skin = "muy-clara" | "clara" | "melocoton" | "media" | "tostada" | "morena" | "morena-oscura" | "oscura";
/** Color de ojos (ids originales). */
export type Eyes = "marron" | "verde" | "azul" | "gris";
/** Forma de ojos (catálogo E01–E06). */
export type EyeShape = "puntos" | "redondos" | "ovalados" | "dormilones" | "cerrados" | "risuenos";
export type Glasses = "no" | "redondas" | "redondas-gruesas" | "ovaladas" | "cuadradas" | "pasta" | "transparentes";
/** Color de la ropa (ids originales). */
export type Outfit = "amarillo" | "rojo" | "verde" | "azul" | "lila" | "naranja";
/** Prenda (catálogo O01–O08). */
export type Garment = "chubasquero" | "peto" | "jersey" | "marinera" | "vestido" | "plumifero" | "pijama" | "verano";
export type Accessory = "no" | "gorro" | "diadema" | "mochila" | "sombrero" | "bufanda" | "lazo" | "casco" | "bolso";
export type PetId = "corgi" | "golden" | "manchado" | "atigrado" | "blanquinegro" | "conejo" | "cobaya" | "periquito";
export type GrandparentId =
  | "abuela-mono"
  | "abuela-rizos"
  | "abuela-ondas"
  | "abuela-gafas"
  | "abuelo-calvo"
  | "abuelo-barba"
  | "abuelo-gafas"
  | "abuelo-gris";
export type StyleId = "3d" | "flat" | "gouache" | "papercraft" | "lapiz" | "acuarela";

export type Expression = "feliz" | "risa" | "sorpresa" | "curioso" | "sueno" | "orgullo";

export interface Traits {
  hair: { shape: HairShape; color: HairColor };
  skin: Skin;
  eyes: Eyes;
  /** Opcional para no romper borradores guardados antes de la Fase 1.5; por defecto "puntos". */
  eyeShape?: EyeShape;
  glasses: Glasses;
  outfit: Outfit;
  /** Opcional; por defecto "jersey" (la prenda que dibujaba el avatar original). */
  garment?: Garment;
  accessory?: Accessory;
}

export type CompanionKind = "perro" | "gato" | "abuela" | "abuelo" | "hermano" | "hermana";

export interface Companion {
  kind: CompanionKind;
  name?: string;
  traits?: Traits; // solo hermano/hermana
  /** Mascota (perro/gato) o abuelo/a concreto del catálogo. */
  variant?: PetId | GrandparentId;
}

export type AgeBand = "2-4" | "5-8";
export type OccasionId = "cumpleanos";
export type SpecialId = "peluche" | "dinosaurios" | "chocolate" | "estrellas" | "coches" | "mariposas";
export type Edition = "classic" | "illustrated" | "hardcover";

export interface Hero {
  name: string;
  age: number;
  traits: Traits;
}

export interface Draft {
  hero: Hero;
  occasionId: OccasionId;
  companion?: Companion;
  special: SpecialId;
  edition: Edition;
  textOverrides: Record<number, string>;
  email?: string;
  updatedAt: number;
}

export type SceneId =
  | "cama-manana"
  | "ventana"
  | "desayuno"
  | "puerta-regalo"
  | "salon-globos"
  | "nube-deseo"
  | "parque"
  | "jardin-juego"
  | "mesa-tarta"
  | "velas"
  | "abrir-regalo"
  | "cama-noche";

export interface ArcPage {
  n: number;
  scene: SceneId;
  expression: Expression;
  withCompanion: boolean;
  text: Record<AgeBand, string>;
  textPet?: Record<AgeBand, string>; // variante cuando el acompañante es una mascota (no habla)
  scenePrompt: string; // para la edición ilustrada
}

export interface Arc {
  id: OccasionId;
  title: string;
  pages: ArcPage[];
}

export interface BookPage {
  n: number;
  scene: SceneId;
  expression: Expression;
  withCompanion: boolean;
  text: string;
  scenePrompt: string;
}

export interface Book {
  title: string;
  dedication: string;
  pages: BookPage[];
}

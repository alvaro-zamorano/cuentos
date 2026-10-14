/**
 * Ficha del cuento y «biblia» del libro (PLAN §3.1). Sustituyen al borrador de cumpleaños (Draft) en el flujo nuevo.
 *
 * - Ficha: lo que pone el padre. Todo opcional salvo el nombre del protagonista.
 * - Biblia: lo que devuelve el planificador (LLM), en castellano y para enseñar al padre: título, dedicatoria,
 *   12 páginas con texto y «qué se verá», lugares y objetos recurrentes.
 * - Dirección de arte: la traducción al inglés para el modelo de imagen. Se hace aparte (lib/plan/art.ts) al pasar
 *   a la ilustración, así el paso 3 es rápido y las ediciones del padre se recogen todas a la vez.
 */
import type { EyeShape, Eyes, Glasses, HairColor, HairShape, Skin, StyleId } from "../types";

export type Tone = "aventura" | "tierno" | "divertido" | "dormir";
/** Solo para la concordancia del castellano. "neutro": el texto evita adjetivos con género para el protagonista. */
export type Gender = "nino" | "nina" | "neutro";
export type CastId = "hero" | "c1" | "c2";
export type Shot = "general" | "medio" | "cerca";
export type TimeOfDay = "dia" | "atardecer" | "noche";

export interface Look {
  hair?: { shape?: HairShape; color?: HairColor };
  skin?: Skin;
  eyes?: Eyes;
  eyeShape?: EyeShape;
  glasses?: Glasses;
  /** «Algo que le hace único», en texto libre (pecas, le falta un diente, su capa). */
  unique?: string;
}

export interface CastMember {
  id: "c1" | "c2";
  /** «criatura»: personaje inventado que no es persona ni mascota (un dragón, la Luna con cara). */
  kind: "persona" | "mascota" | "criatura";
  name: string;
  /** Relación con el protagonista: «abuela», «hermano mayor», «su perro». */
  relation: string;
  /** Una línea de aspecto en texto libre. */
  look: string;
}

export interface Ficha {
  /** «Cuéntanos la idea como se la contarías a un amigo.» Vacía = «Sorpréndeme». */
  idea: string;
  /** Idea de arranque elegida (lib/plan/starters.ts), si la hay. */
  starter?: string;
  tone?: Tone;
  /** «De parte de…» */
  from?: string;
  /** Dedicatoria propia; si falta, la propone el planificador. */
  dedication?: string;
  hero: { name: string; age: number; gender: Gender; look: Look; /** Ropa habitual en texto libre. */ outfit?: string };
  cast: CastMember[];
  /** «Lo que solo tú sabes»: 0–5 líneas libres. */
  details: string[];
  styleId: StyleId;
  /** «Escribirlo de otra manera»: cambia la semilla y con ella la huella. */
  seed: number;
}

export interface Place {
  id: string;
  name: string;
  /** Una frase de cómo es (para repetirlo igual en todas las páginas donde sale). */
  desc: string;
}

export interface BookObject {
  id: string;
  name: string;
  desc: string;
}

export interface PlanPage {
  n: number;
  text: string;
  /** Qué se verá, en castellano, una o dos frases. Sin números que haya que contar. */
  scene: string;
  /** Quién sale de la ficha (hero, c1, c2). */
  who: CastId[];
  /** Personajes de una sola página, descritos en una frase («una señora con un paraguas de lunares»). */
  extras: string[];
  place: string | null;
  objects: string[];
  /** Ropa de esta página si no es la habitual («traje de astronauta blanco»). */
  outfit: string | null;
  shot: Shot;
  time: TimeOfDay;
}

export interface Plan {
  title: string;
  dedication: string;
  tone: Tone;
  /**
   * Recurrentes que inventa el planificador cuando la historia los necesita (el dinosaurio que sale del huevo) y quedan
   * huecos en el reparto (máximo 2 en total). Entran en la hoja como los del padre.
   */
  extraCast: CastMember[];
  places: Place[];
  objects: BookObject[];
  pages: PlanPage[];
  /** Escena de la portada, en castellano. */
  cover: string;
  /** Avisos para el padre: «cambiamos a Spiderman por un superhéroe inventado». */
  notices: string[];
}

/** Resultado guardado: el plan con quién lo escribió y para qué ficha (huella). */
export interface PlanRecord {
  plan: Plan;
  provider: string;
  model: string;
  fichaHash: string;
  createdAt: number;
}

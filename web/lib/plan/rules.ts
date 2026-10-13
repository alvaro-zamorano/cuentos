/**
 * Reglas del planificador (PLAN §3.1 y §3.3), compartidas por el prompt, el validador y el mock.
 */
import { BRANDS, DIMINUTIVES } from "../story/spec";
import { norm } from "../story/validate";

export const PAGES = 12;
export const MAX_CAST = 2;
export const MAX_PLACES = 4;
export const MAX_OBJECTS = 3;
export const MAX_IN_IMAGE = 3;
export const MIN_HERO_PAGES = 10;
export const TITLE_MAX_WORDS = 7;
export const DEDICATION_MAX_WORDS = 30;

export interface LengthRule {
  /** Lo que se pide en el prompt. */
  min: number;
  max: number;
  /** Lo que el validador acepta sin reintentar (margen sobre lo pedido). */
  hardMin: number;
  hardMax: number;
  maxSentence: number | null;
  label: string;
}

export function lengthRule(age: number): LengthRule {
  if (age <= 3) return { min: 8, max: 30, hardMin: 5, hardMax: 40, maxSentence: 10, label: "frases muy cortas, ritmo y repeticiones, vocabulario de casa" };
  if (age <= 6) return { min: 20, max: 55, hardMin: 12, hardMax: 70, maxSentence: null, label: "frases sencillas, algún diálogo, humor" };
  return { min: 35, max: 85, hardMin: 25, hardMax: 105, maxSentence: null, label: "más trama y diálogo, vocabulario rico pero claro" };
}

/**
 * Personajes y franquicias con derechos (normalizados, sin tildes). Nunca en el texto ni en la imagen: el planificador
 * los sustituye por equivalentes inventados y avisa. Los personajes de tradición (Reyes Magos, Papá Noel, Ratoncito
 * Pérez, Caperucita) sí se pueden usar.
 */
export const PROTECTED = [
  "spiderman", "spider-man", "spidey", "batman", "superman", "hulk", "iron man", "ironman", "capitan america", "vengadores", "avengers", "marvel",
  "elsa y anna", "frozen", "olaf", "mickey", "minnie", "pato donald", "goofy", "pluto", "disney", "pixar", "dreamworks",
  "pikachu", "pokemon", "peppa", "peppa pig", "bluey", "patrulla canina", "paw patrol", "sonic", "super mario", "mario bros", "luigi",
  "harry potter", "hogwarts", "buzz lightyear", "toy story", "rayo mcqueen", "nemo", "dory", "simba", "rey leon", "stitch", "moana", "vaiana",
  "mirabel", "minions", "minion", "shrek", "totoro", "doraemon", "pocoyo", "bob esponja", "hello kitty", "star wars", "darth vader", "yoda",
  "jedi", "ladybug y cat noir", "prodigiosa ladybug", "gru", "lightning mcqueen", "dumbo", "bambi", "winnie the pooh", "tigger", "cocomelon",
];

export const NAMED_IP = [...new Set([...PROTECTED, ...BRANDS])];

/** ¿Nombra el texto una marca o un personaje con derechos? Devuelve el primero que encuentre. */
export function namedIp(text: string): string | null {
  const t = ` ${norm(text).replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ")} `;
  for (const ip of NAMED_IP) if (t.includes(` ${ip} `) || t.includes(` ${ip}s `)) return ip;
  return null;
}

/** Números que obligarían a contar dentro de la imagen (rule 4 de §3.3): cifras y de «tres» en adelante. */
const COUNT_WORDS = ["tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "veinte", "docena", "docenas", "cien"];
export function countingIn(scene: string): string | null {
  const d = scene.match(/\d+/);
  if (d) return d[0];
  const words = norm(scene).match(/[\p{L}]+/gu) ?? [];
  return words.find((w) => COUNT_WORDS.includes(w)) ?? null;
}

/** Peticiones de letras dentro de la imagen (el modelo las pinta mal; el texto va en la banda). */
const TEXT_IN_IMAGE = [/\bletreros?\b/, /\bcartel(es)?\b/, /\bpancartas?\b/, /\brotulos?\b/, /\bque pone\b/, /\bque dice\b/, /\bcon (su|el) nombre\b/, /\bescrito\b/];
export function textInImage(scene: string): string | null {
  const t = norm(scene);
  const re = TEXT_IN_IMAGE.find((r) => r.test(t));
  return re ? (t.match(re)?.[0] ?? "texto") : null;
}

export const DIMINUTIVE_SET = new Set(DIMINUTIVES.map(norm));

/** Nombres propios que no hace falta dar (días, meses, familia, fiestas, astros personificados). */
export const COMMON_PROPER = [
  "lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo",
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  "mama", "papa", "abuela", "abuelo", "yaya", "yayo", "tata", "tito", "tita", "feliz", "cumpleanos", "fin",
  "navidad", "nochebuena", "nochevieja", "reyes", "magos", "melchor", "gaspar", "baltasar", "papa noel", "noel", "ratoncito", "perez",
  "luna", "sol", "tierra", "marte", "estrella", "polar", "halloween", "carnaval", "pascua", "verano", "invierno", "primavera", "otono",
  "caperucita", "blancanieves", "cenicienta", "pinocho",
];

import type { Draft } from "../types";

/** Máximo de detalles reales y longitud de cada uno (paso 2, «Lo que solo tú sabes»). */
export const MAX_DETAILS = 5;
export const MAX_DETAIL_CHARS = 140;
export const MIN_DETAILS_TO_CONTINUE = 2;

const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;

/** Limpia un detalle: sin emojis ni caracteres de control, espacios colapsados, ≤ 140 caracteres. */
export function cleanDetail(s: unknown): string {
  if (typeof s !== "string") return "";
  return s.replace(EMOJI_RE, "").replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL_CHARS);
}

/** Detalles con contenido, en el orden en que los escribió el adulto. */
export function filledDetails(details: unknown): string[] {
  if (!Array.isArray(details)) return [];
  return details.slice(0, MAX_DETAILS).map(cleanDetail).filter((d) => d.length > 0);
}

/** cyrb53: hash rápido y estable, igual en navegador y servidor (no criptográfico). */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/** Entradas de las que depende el texto: nombre, edad, acompañante, detalle especial, detalles y semilla. */
export function storyInputs(draft: Pick<Draft, "hero" | "companion" | "special" | "details" | "storySeed" | "occasionId">) {
  return {
    occasion: draft.occasionId,
    name: draft.hero.name.trim(),
    age: draft.hero.age,
    companion: draft.companion ? { kind: draft.companion.kind, name: draft.companion.name?.trim() || "" } : null,
    special: draft.special,
    details: filledDetails(draft.details),
    seed: draft.storySeed ?? 0,
  };
}

export function storyInputHash(draft: Pick<Draft, "hero" | "companion" | "special" | "details" | "storySeed" | "occasionId">): string {
  return hashString(JSON.stringify(storyInputs(draft)));
}

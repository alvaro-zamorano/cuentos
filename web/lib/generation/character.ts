import { describeTraitsEn, normalizeTraits } from "../traits";
import type { Traits } from "../types";

/**
 * Descripción canónica del protagonista («character bible», RF-10). Texto en inglés, fijo y ordenado:
 * edad aparente → pelo (forma y color) → piel → ojos → gafas → prenda con color → accesorio → proporciones.
 * Es la misma frase, palabra por palabra, en la hoja de personaje y en cada página: mismos rasgos ⇒ mismo texto.
 * El orden de los rasgos lo fija describeTraitsEn (lib/traits.ts); aquí solo se añaden edad, nombre y proporciones.
 */
export function characterBible(traits: Traits, age: number, name?: string): string {
  const years = Number.isFinite(age) ? Math.min(10, Math.max(2, Math.round(age))) : 5;
  const cleanName = (name ?? "").replace(/[^\p{L}\p{M}' -]/gu, "").trim().slice(0, 30);
  const who = cleanName ? `a child named ${cleanName}` : "a child";
  return [
    `${who} who looks about ${years} years old`,
    describeTraitsEn(normalizeTraits(traits)),
    `drawn with children's picture-book proportions (large round head, short rounded body, soft features, rosy cheeks)`,
    `always the same child: identical face, hairstyle, hair colour, skin tone, eyes and outfit in every image`,
  ].join("; ");
}

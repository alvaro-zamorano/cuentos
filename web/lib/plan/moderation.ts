/**
 * Moderación del texto libre de la ficha (PLAN §3.1) y de lo que escribe el planificador. Primera barrera, local y
 * sin coste: palabras que nunca van en un cuento infantil, datos de contacto y lo que contradice «solo ocasiones
 * felices» (8 oct). Lo sutil lo resuelve el planificador: adapta o devuelve `refusal` (lib/plan/prompt.ts).
 */
import { norm, tokens } from "../story/validate";
import type { Ficha } from "./types";

/** Raíces (sin tildes) que bastan para rechazar. Elegidas para no chocar con palabras normales («armario», «disparate»). */
const STEMS = ["asesin", "pistol", "tortur", "secuestr", "apunal", "degoll", "suicid", "porno", "erotic", "desnud", "cocain", "marihuan", "fallec", "cadaver", "muert"];
/** Palabras exactas (sin tildes). */
const WORDS = [
  "matar", "mato", "matan", "matarlo", "matarla", "mataron", "morir", "murio", "muere", "mueren", "funeral", "entierro",
  "arma", "armas", "rifle", "escopeta", "cuchillo", "cuchillos", "navaja", "bomba", "bombas", "disparo", "disparos", "disparar", "dispara", "disparan",
  "sangre", "sangrando", "violar", "violacion", "violada", "violado",
  "sexo", "sexual", "sexy", "follar", "droga", "drogas", "drogado", "porro", "porros",
  "puta", "puto", "putas", "gilipollas", "subnormal", "retrasado", "retrasada", "maricon", "mierda", "cabron", "cabrona", "joder", "cono", "zorra",
];
const WORD_SET = new Set(WORDS);

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/i;
const PHONE_RE = /(?:\+?\d[\s.-]?){9,}/;

export interface Moderation {
  ok: boolean;
  /** Campo de la ficha donde está el problema (para señalarlo en el formulario). */
  field?: string;
  /** Mensaje para el padre, en castellano. */
  message?: string;
  /** Palabra o motivo (para el validador y los tests). */
  hit?: string;
}

/** Frases hechas que no son lo que parecen («muerta de risa», «se muere de ganas»). */
const IDIOMS_RE = /\b(?:muert[oa]s?|muer[eo]n?|muero|morir(?:se)?|morirme|morirte) de (?:risa|ganas|sueno|hambre|frio|calor|verguenza|envidia|curiosidad|aburrimiento)\b/g;

/** Palabra bloqueada en un texto, o null. */
export function blockedWord(text: string): string | null {
  for (const w of tokens(norm(text).replace(IDIOMS_RE, " "))) {
    if (WORD_SET.has(w)) return w;
    if (STEMS.some((s) => w.startsWith(s))) return w;
  }
  return null;
}

export function contactData(text: string): string | null {
  if (EMAIL_RE.test(text)) return "email";
  if (URL_RE.test(text)) return "enlace";
  if (PHONE_RE.test(text)) return "teléfono";
  return null;
}

/** Textos libres de la ficha con su campo. */
export function fichaTexts(f: Ficha): { field: string; text: string }[] {
  const out = [
    { field: "idea", text: f.idea },
    { field: "hero.name", text: f.hero.name },
    { field: "hero.look.unique", text: f.hero.look.unique ?? "" },
    { field: "hero.outfit", text: f.hero.outfit ?? "" },
    { field: "from", text: f.from ?? "" },
    { field: "dedication", text: f.dedication ?? "" },
    ...f.cast.flatMap((c, i) => [
      { field: `cast.${i}.name`, text: c.name },
      { field: `cast.${i}.relation`, text: c.relation },
      { field: `cast.${i}.look`, text: c.look },
    ]),
    ...f.details.map((d, i) => ({ field: `details.${i}`, text: d })),
  ];
  return out.filter((x) => x.text.trim().length > 0);
}

export function moderateFicha(f: Ficha): Moderation {
  for (const { field, text } of fichaTexts(f)) {
    const word = blockedWord(text);
    if (word) {
      return {
        ok: false,
        field,
        hit: word,
        message: `Hay algo que no podemos poner en un cuento infantil («${word}»). Cámbialo y seguimos; por ahora hacemos cuentos de momentos felices.`,
      };
    }
    const contact = contactData(text);
    if (contact) {
      return { ok: false, field, hit: contact, message: `Quita el ${contact}: en el cuento no hace falta y así no queda en ningún sitio.` };
    }
  }
  return { ok: true };
}

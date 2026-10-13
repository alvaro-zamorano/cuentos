/**
 * Ficha del cuento: limpieza de lo que llega del cliente, valores por defecto y huella.
 * Sin dependencias de servidor (la usan el cliente, las rutas y los tests).
 */
import { hashString } from "../story/hash";
import { EYES, EYE_SHAPES, GLASSES, HAIR_COLORS, HAIR_SHAPES, SKINS } from "../traits";
import { STYLES } from "../generation/styles";
import type { AgeBand, StyleId } from "../types";
import type { CastMember, Ficha, Gender, Look, Tone } from "./types";

export const LIMITS = {
  idea: 600,
  name: 24,
  from: 60,
  dedication: 220,
  unique: 160,
  outfit: 120,
  castName: 24,
  castRelation: 40,
  castLook: 160,
  detail: 160,
  details: 5,
  cast: 2,
  minAge: 1,
  maxAge: 10,
} as const;

export const TONES: { id: Tone; label: string }[] = [
  { id: "aventura", label: "Aventura" },
  { id: "tierno", label: "Tierno" },
  { id: "divertido", label: "Divertido" },
  { id: "dormir", label: "Para dormir" },
];

export const GENDERS: { id: Gender; label: string }[] = [
  { id: "nina", label: "Niña" },
  { id: "nino", label: "Niño" },
  { id: "neutro", label: "Prefiero no decirlo" },
];

export const DEFAULT_STYLE: StyleId = "gouache";

/** Quita emojis, controles y espacios repetidos; recorta a `max`. */
export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\p{Extended_Pictographic}|\p{Cc}|️|‍/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

const oneOf = <T extends string>(list: readonly { id: T }[], v: unknown): T | undefined =>
  list.some((x) => x.id === v) ? (v as T) : undefined;

function cleanLook(v: unknown): Look {
  const l = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const hair = (l.hair && typeof l.hair === "object" ? l.hair : {}) as Record<string, unknown>;
  const look: Look = {};
  const shape = oneOf(HAIR_SHAPES, hair.shape);
  const color = oneOf(HAIR_COLORS, hair.color);
  if (shape || color) look.hair = { ...(shape ? { shape } : {}), ...(color ? { color } : {}) };
  const skin = oneOf(SKINS, l.skin);
  if (skin) look.skin = skin;
  const eyes = oneOf(EYES, l.eyes);
  if (eyes) look.eyes = eyes;
  const eyeShape = oneOf(EYE_SHAPES, l.eyeShape);
  if (eyeShape) look.eyeShape = eyeShape;
  const glasses = oneOf(GLASSES, l.glasses);
  if (glasses) look.glasses = glasses;
  const unique = cleanText(l.unique, LIMITS.unique);
  if (unique) look.unique = unique;
  return look;
}

function cleanCast(v: unknown): CastMember[] {
  if (!Array.isArray(v)) return [];
  const out: CastMember[] = [];
  for (const raw of v.slice(0, LIMITS.cast)) {
    const c = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const name = cleanText(c.name, LIMITS.castName);
    const relation = cleanText(c.relation, LIMITS.castRelation);
    if (!name && !relation) continue;
    out.push({
      id: out.length === 0 ? "c1" : "c2",
      kind: c.kind === "mascota" || c.kind === "criatura" ? c.kind : "persona",
      name,
      relation,
      look: cleanText(c.look, LIMITS.castLook),
    });
  }
  return out;
}

/** Ficha válida a partir de lo que mande el cliente. Nunca lanza: lo que no vale se descarta. */
export function normalizeFicha(v: unknown): Ficha {
  const f = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const h = (f.hero && typeof f.hero === "object" ? f.hero : {}) as Record<string, unknown>;
  const age = Math.round(Number(h.age));
  const style = typeof f.styleId === "string" && STYLES.some((s) => s.id === f.styleId) ? (f.styleId as StyleId) : DEFAULT_STYLE;
  const details = Array.isArray(f.details) ? f.details.map((d) => cleanText(d, LIMITS.detail)).filter(Boolean).slice(0, LIMITS.details) : [];
  const ficha: Ficha = {
    idea: cleanText(f.idea, LIMITS.idea),
    hero: {
      name: cleanText(h.name, LIMITS.name).replace(/[^\p{L}\p{M}' -]/gu, "").trim(),
      age: Number.isFinite(age) ? Math.min(LIMITS.maxAge, Math.max(LIMITS.minAge, age)) : 5,
      gender: oneOf(GENDERS, h.gender) ?? "neutro",
      look: cleanLook(h.look),
    },
    cast: cleanCast(f.cast),
    details,
    styleId: style,
    seed: Number.isInteger(f.seed) && (f.seed as number) >= 0 ? Math.min(f.seed as number, 99) : 0,
  };
  const outfit = cleanText(h.outfit, LIMITS.outfit);
  if (outfit) ficha.hero.outfit = outfit;
  const starter = typeof f.starter === "string" && /^[a-z-]{2,20}$/.test(f.starter) ? f.starter : undefined;
  if (starter) ficha.starter = starter;
  const tone = oneOf(TONES, f.tone);
  if (tone) ficha.tone = tone;
  const from = cleanText(f.from, LIMITS.from);
  if (from) ficha.from = from;
  const dedication = cleanText(f.dedication, LIMITS.dedication);
  if (dedication) ficha.dedication = dedication;
  return ficha;
}

/** Huella de todo lo que cambia la historia (no el estilo: el texto no depende de él). */
export function fichaHash(f: Ficha): string {
  const { styleId: _style, ...rest } = f;
  void _style;
  return hashString(JSON.stringify(["plan-v1", rest]));
}

/** Huella de lo que cambia la hoja de reparto: aspecto del protagonista, ropa habitual, reparto y estilo. */
export function castHash(f: Ficha): string {
  return hashString(JSON.stringify(["cast-v1", f.styleId, f.hero.name, f.hero.age, f.hero.gender, f.hero.look, f.hero.outfit ?? null, f.cast]));
}

export function ageBand(age: number): AgeBand {
  return age <= 4 ? "2-4" : "5-8";
}

const label = <T extends { id: string; label: string }>(list: T[], id?: string) => list.find((x) => x.id === id)?.label.toLowerCase();

/** Aspecto del protagonista en castellano, para el prompt del planificador y para enseñarlo. */
export function describeLookEs(look: Look): string {
  const parts: string[] = [];
  const shape = label(HAIR_SHAPES, look.hair?.shape);
  const color = label(HAIR_COLORS, look.hair?.color);
  if (shape || color) parts.push(`pelo ${[shape, color].filter(Boolean).join(" ")}`);
  const skin = label(SKINS, look.skin);
  if (skin) parts.push(`piel ${skin}`);
  const eyes = label(EYES, look.eyes);
  if (eyes) parts.push(`ojos ${eyes}`);
  if (look.glasses && look.glasses !== "no") parts.push(`gafas ${label(GLASSES, look.glasses)}`);
  if (look.unique) parts.push(look.unique);
  return parts.join(", ");
}

const en = <T extends { id: string; en: string }>(list: T[], id?: string) => list.find((x) => x.id === id)?.en;

/**
 * Rasgos fijos del protagonista en inglés (chips). El texto libre («algo que le hace único», la ropa) lo traduce la
 * dirección de arte; esto es lo que no puede variar entre la hoja y las páginas.
 */
export function describeLookEn(look: Look): string {
  const parts: string[] = [];
  const shape = en(HAIR_SHAPES, look.hair?.shape);
  const color = en(HAIR_COLORS, look.hair?.color);
  if (shape || color) parts.push(`${[shape, color].filter(Boolean).join(" ")} hair`);
  const skin = en(SKINS, look.skin);
  if (skin) parts.push(`${skin} skin`);
  const eyes = en(EYES, look.eyes);
  const eyeShape = en(EYE_SHAPES, look.eyeShape);
  if (eyes || eyeShape) parts.push(`${[eyeShape, eyes].filter(Boolean).join(" ")} eyes`);
  const glasses = en(GLASSES, look.glasses);
  if (glasses) parts.push(glasses);
  return parts.join(", ");
}

/** Ficha mínima con valores por defecto (paso 1 sin nada todavía). */
export function emptyFicha(): Ficha {
  return { idea: "", hero: { name: "", age: 5, gender: "neutro", look: {} }, cast: [], details: [], styleId: DEFAULT_STYLE, seed: 0 };
}

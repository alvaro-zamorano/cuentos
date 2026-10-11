/**
 * Validación automática de una historia (brief 5, §C). Heurística, sin dependencias: la usan la ruta y los tests.
 */
import { cumpleanos } from "../arcs/cumpleanos";
import {
  BEATS,
  BLACKLIST_STEMS,
  BLACKLIST_WORDS,
  BRANDS,
  DEDICATION_MAX_WORDS,
  DIMINUTIVES,
  EXPRESSIONS,
  LENGTH_RULES,
  SCENES,
  TITLE_MAX_WORDS,
  type StoryInput,
} from "./spec";

export interface StoryOutputPage {
  n: number;
  scene: string;
  expression: string;
  withCompanion: boolean;
  text: string;
  sceneBrief: string;
}

export interface StoryOutput {
  title: string;
  dedication: string;
  pages: StoryOutputPage[];
}

export interface Validation {
  ok: boolean;
  issues: string[];
}

/** Sin tildes ni mayúsculas (la ñ queda como n). */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const WORD_RE = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
const EMOJI_RE = /\p{Extended_Pictographic}/u;
const SENTENCE_SPLIT = /[.!?…;:]+/;

/** Palabras vacías de ≥ 5 letras que no identifican un detalle. */
const STOP = new Set(
  ["cuando", "porque", "siempre", "todos", "todas", "donde", "mucho", "mucha", "muchos", "muchas", "antes", "despues", "ahora", "mismo", "misma",
    "tambien", "tiene", "tienen", "hacer", "estar", "favorito", "favorita", "favoritos", "favoritas", "encanta", "gusta", "gustan", "cosas", "nuestro",
    "nuestra", "desde", "hasta", "entre", "sobre", "luego", "otra", "otras", "otros", "cuantos", "aunque", "mientras", "dice", "dicen", "repite", "siempre"].map(norm),
);
export const CONNECTORS = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "y", "o", "a", "al", "en", "con", "por", "para", "que", "su", "sus", "se", "le", "lo", "ni", "mi", "tu"]);

export function tokens(s: string): string[] {
  return s.match(WORD_RE) ?? [];
}

/** Palabras significativas de un detalle (≥ 5 letras, sin palabras vacías), normalizadas. */
export function keywords(detail: string): string[] {
  return [...new Set(tokens(norm(detail)).filter((w) => w.length >= 5 && !STOP.has(w)))];
}

/** Vocabulario propio del cumpleaños (arco y esqueleto): «parque», «tarta», «salón» no prueban que un detalle esté. */
const STORY_VOCAB = new Set(
  tokens(
    norm(
      [
        ...cumpleanos.pages.flatMap((p) => [p.text["2-4"], p.text["5-8"], p.textPet?.["2-4"] ?? "", p.textPet?.["5-8"] ?? ""]),
        ...BEATS.flatMap((b) => [b.goal, b.brief]),
      ].join(" "),
    ),
  ).map(stem),
);

/** Palabras que identifican un detalle: sus palabras significativas que no son vocabulario del cumpleaños (si todas lo son, todas). */
export function distinctiveKeywords(detail: string): string[] {
  const all = keywords(detail);
  const own = all.filter((k) => !STORY_VOCAB.has(stem(k)));
  return own.length ? own : all;
}

/** Raíz para buscar una palabra con tolerancia a plural/género: «dinosaurios» → «dinosauri». */
export function stem(w: string): string {
  return w.slice(0, Math.max(5, w.length - 2));
}

/** Nombres propios dados (niño, acompañante) que cuentan como una sola palabra. */
function givenNames(input: StoryInput): string[] {
  return [input.name, input.companion?.name].filter((x): x is string => !!x && x.trim().length > 0);
}

function collapseNames(text: string, names: string[]): string {
  let out = text;
  for (const n of names) if (n.includes(" ")) out = out.split(n).join("Nombre");
  return out;
}

export function countWords(text: string, names: string[] = []): number {
  return tokens(collapseNames(text, names)).length;
}

export function sentences(text: string): string[] {
  return text
    .split(SENTENCE_SPLIT)
    .map((s) => s.trim())
    .filter((s) => tokens(s).length > 0);
}

export function hasBlacklisted(text: string): string | null {
  for (const w of tokens(norm(text))) {
    if (BLACKLIST_WORDS.includes(w)) return w;
    const s = BLACKLIST_STEMS.find((b) => w.startsWith(b));
    if (s) return w;
  }
  return null;
}

const DIM = new Set(DIMINUTIVES.map(norm));
const COMPARISON_RES = [
  /\b(que|como) (los|las) (demas|otros|otras) (ninos|ninas)\b/,
  /\b(que|como) (ningun|ninguna) otr[oa] (nino|nina)\b/,
  /\bmejor que (sus|los|las|otros|otras|nadie|todos|todas)\b/,
  /\bmas [a-z]+ que (sus amig[oa]s|los demas|las demas|otros ninos|otras ninas|nadie|todos)\b/,
];

const DAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const FAMILY = ["mamá", "papá", "abuela", "abuelo", "yaya", "yayo", "hoy", "feliz", "cumpleaños"];

/** Palabras con mayúscula que no son inicio de frase ni están permitidas. */
export function disallowedNames(text: string, allowed: Set<string>): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(WORD_RE)) {
    const w = m[0];
    const first = w.charAt(0);
    if (first === first.toLowerCase() || /^\p{N}/u.test(w)) continue;
    if (w.length > 1 && w === w.toUpperCase()) continue; // onomatopeyas y siglas en mayúsculas (FUUU)
    if (allowed.has(norm(w))) continue;
    // inicio de frase: principio del texto o tras . ! ? … : ; (con signos de apertura o comillas en medio)
    const before = text.slice(0, m.index).replace(/[\s¡¿«"“'(—–-]+$/u, "");
    if (before.length === 0 || /[.!?…:;]$/u.test(before) || /[«"“—–]\s*$/u.test(text.slice(0, m.index))) continue;
    out.push(w);
  }
  return out;
}

export function allowedNames(input: StoryInput): Set<string> {
  const set = new Set<string>([...DAYS, ...MONTHS, ...FAMILY].map(norm));
  for (const n of givenNames(input)) for (const t of tokens(n)) set.add(norm(t));
  // nombres que el adulto escribió en sus detalles (p. ej. «el parque del Retiro», «su prima Lola»)
  for (const d of input.details) for (const t of tokens(d)) if (t.charAt(0) !== t.charAt(0).toLowerCase()) set.add(norm(t));
  return set;
}

/** Detalles que cuentan para la cobertura: con palabra significativa y sin contenido de la lista negra. */
export function usableDetails(input: StoryInput): string[] {
  return input.details.filter((d) => keywords(d).length > 0 && !hasBlacklisted(d));
}

export function detailPresent(detail: string, normalizedStory: string): boolean {
  return distinctiveKeywords(detail).some((k) => normalizedStory.includes(stem(k)));
}

export function validateStory(output: unknown, input: StoryInput): Validation {
  const issues: string[] = [];
  const o = output as Partial<StoryOutput> | null;
  if (!o || typeof o !== "object") return { ok: false, issues: ["La respuesta no es un objeto JSON."] };
  if (typeof o.title !== "string" || !o.title.trim()) issues.push("Falta el título.");
  if (typeof o.dedication !== "string" || !o.dedication.trim()) issues.push("Falta la dedicatoria.");
  if (!Array.isArray(o.pages)) return { ok: false, issues: [...issues, "Falta la lista de páginas."] };

  const pages = o.pages as Partial<StoryOutputPage>[];
  if (pages.length !== 12) issues.push(`Tiene que haber 12 páginas; hay ${pages.length}.`);
  const ns = pages.map((p) => p?.n).filter((n): n is number => typeof n === "number").sort((a, b) => a - b);
  const expected = Array.from({ length: 12 }, (_, i) => i + 1);
  if (ns.length !== pages.length || ns.join(",") !== expected.slice(0, ns.length).join(",") || ns.length !== 12) {
    issues.push("Los números de página tienen que ir del 1 al 12 sin huecos ni repeticiones.");
  }

  const names = givenNames(input);
  const allowed = allowedNames(input);
  const len = LENGTH_RULES[input.band];
  const detailsInText = new Set(tokens(norm(input.details.join(" "))));
  const brandsAllowed = (b: string) => norm(input.details.join(" ")).includes(b);

  const checkCommon = (label: string, text: string) => {
    if (EMOJI_RE.test(text)) issues.push(`${label}: contiene emojis.`);
    const bad = hasBlacklisted(text);
    if (bad && !detailsInText.has(bad)) issues.push(`${label}: palabra no permitida «${bad}».`);
    const nt = norm(text);
    for (const w of tokens(nt)) if (DIM.has(w)) issues.push(`${label}: diminutivo «${w}».`);
    for (const b of BRANDS) if (new RegExp(`\\b${b}\\b`).test(nt) && !brandsAllowed(b)) issues.push(`${label}: marca «${b}».`);
    if (COMPARISON_RES.some((re) => re.test(nt))) issues.push(`${label}: comparación con otros niños.`);
    const wrongNames = disallowedNames(text, allowed);
    if (wrongNames.length) issues.push(`${label}: nombres no permitidos (${[...new Set(wrongNames)].join(", ")}).`);
  };

  if (typeof o.title === "string") {
    if (countWords(o.title, names) > TITLE_MAX_WORDS) issues.push(`El título tiene más de ${TITLE_MAX_WORDS} palabras.`);
    checkCommon("Título", o.title);
  }
  if (typeof o.dedication === "string") {
    if (countWords(o.dedication, names) > DEDICATION_MAX_WORDS) issues.push(`La dedicatoria tiene más de ${DEDICATION_MAX_WORDS} palabras.`);
    checkCommon("Dedicatoria", o.dedication);
  }

  for (const p of pages) {
    const label = `Página ${p?.n ?? "?"}`;
    if (!p || typeof p !== "object") {
      issues.push(`${label}: no es un objeto.`);
      continue;
    }
    if (!SCENES.includes(p.scene as never)) issues.push(`${label}: escena «${p.scene}» no válida.`);
    if (!EXPRESSIONS.includes(p.expression as never)) issues.push(`${label}: expresión «${p.expression}» no válida.`);
    if (typeof p.withCompanion !== "boolean") issues.push(`${label}: withCompanion tiene que ser true o false.`);
    if (typeof p.text !== "string" || !p.text.trim()) {
      issues.push(`${label}: falta el texto.`);
      continue;
    }
    const words = countWords(p.text, names);
    if (words < len.minWords || words > len.maxWords) issues.push(`${label}: ${words} palabras; tienen que ser entre ${len.minWords} y ${len.maxWords}.`);
    if (len.maxSentenceWords) {
      const long = sentences(p.text).find((s) => countWords(s, names) > len.maxSentenceWords!);
      if (long) issues.push(`${label}: frase de más de ${len.maxSentenceWords} palabras («${long.slice(0, 60)}»).`);
    }
    checkCommon(label, p.text);
  }

  const story = norm(pages.map((p) => (typeof p?.text === "string" ? p.text : "")).join(" \n "));
  const usable = usableDetails(input);
  const required = Math.min(3, usable.length);
  const present = usable.filter((d) => detailPresent(d, story)).length;
  if (present < required) issues.push(`Aparecen ${present} detalles reales; tienen que aparecer al menos ${required}.`);
  if (!keywords(input.special.phrase).some((k) => story.includes(stem(k)))) issues.push(`No aparece lo que más le gusta (${input.special.phrase}).`);

  return { ok: issues.length === 0, issues };
}

/** Extrae el JSON de una respuesta (tolerante a texto o bloque de código alrededor). */
export function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no_json");
  return JSON.parse(raw.slice(start, end + 1));
}


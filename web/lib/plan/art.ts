/**
 * Dirección de arte (B3/B4): del plan en castellano a descripciones en inglés para el modelo de imagen, y los prompts
 * de la hoja de reparto, la portada y las páginas (reglas de la Fase 0, PLAN §3.3).
 *
 * - Identidad y vestuario van separados: la identidad no cambia nunca; la ropa puede cambiar por página.
 * - Los rasgos de los chips del protagonista se escriben aquí, sin LLM (describeLookEn): son los que no pueden variar.
 * - El LLM traduce lo libre (aspecto único, ropa, reparto, lugares, objetos, escenas) en una o dos llamadas:
 *   castArt (reparto + portada, al pasar al paso 4) y pagesArt (las 12 páginas, tras el pago).
 */
import { extractJsonObject, llmCostCents, selectLlm, type Llm } from "../llm";
import { hashString } from "../story/hash";
import type { StyleDef } from "../generation/styles";
import { describeLookEn } from "./ficha";
import type { CastId, CastMember, Ficha, Plan, PlanPage } from "./types";

export interface ArtCast {
  id: CastId;
  name: string;
  kind: "child" | "persona" | "mascota" | "criatura";
  /** Quién es y cómo es, sin ropa (cara, pelo, piel, ojos, gafas, rasgos, proporciones). */
  identityEn: string;
  /** Ropa habitual (vacío para animales sin ropa). */
  outfitEn: string;
}

export interface ArtPage {
  n: number;
  sceneEn: string;
  outfitEn: string | null;
  extrasEn: string[];
}

export interface CastArt {
  /** Huella de lo que lo produjo (ficha de aspecto + reparto + portada): si cambia, se rehace. */
  key: string;
  cast: ArtCast[];
  places: Record<string, string>;
  objects: Record<string, string>;
  coverEn: string;
  /** Cambios con palabras ya aplicados a la hoja («más rizos»), en orden. */
  revisions: string[];
}

export interface PagesArt {
  key: string;
  pages: ArtPage[];
}

const STYLE_REF_ONLY = "Use the style reference image only for its rendering style, palette and texture; never copy its characters, clothes or scene.";
const NO_TEXT = "No text, letters, numbers, signs or labels anywhere in the image. No logos or recognisable branded products (toy building blocks are plain wooden cubes without studs).";
const PROPORTIONS = "children's picture-book proportions: large round head, short rounded body, soft features, rosy cheeks";

/* ------------------------------ huellas ------------------------------ */

export function castArtKey(f: Ficha, plan: Pick<Plan, "extraCast" | "places" | "objects" | "cover">): string {
  return hashString(JSON.stringify(["cast-art-v1", f.hero.name, f.hero.age, f.hero.gender, f.hero.look, f.hero.outfit ?? null, f.cast, plan.extraCast, plan.places, plan.objects, plan.cover]));
}

/** Huella de lo que pinta una página: reparto/arte + la escena de esa página. El texto no entra: editarlo no repinta. */
export function pageArtKey(cast: CastArt, p: Pick<PlanPage, "n" | "scene" | "who" | "extras" | "place" | "objects" | "outfit" | "shot" | "time">): string {
  return hashString(JSON.stringify(["page-art-v1", cast.key, cast.revisions, p.n, p.scene, p.who, p.extras, p.place, p.objects, p.outfit, p.shot, p.time]));
}

/* ------------------------------ LLM: reparto y portada ------------------------------ */

/** Una llamada que tiene que devolver JSON; si no lo es, otra vez (la segunda falla hacia arriba). */
async function completeJson<T>(llm: Llm, user: string, maxTokens: number): Promise<{ res: Awaited<ReturnType<Llm["complete"]>>; raw: T }> {
  let last: unknown;
  for (let i = 0; i < 2; i++) {
    const res = await llm.complete({ system: ART_SYSTEM, messages: [{ role: "user", content: user }], maxTokens, temperature: 0.3 });
    try {
      return { res, raw: extractJsonObject(res.raw) as T };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("art_json");
}

function heroChildWord(f: Ficha): string {
  return f.hero.gender === "nina" ? "girl" : f.hero.gender === "nino" ? "boy" : "child";
}

const ART_SYSTEM = [
  "You are the art director of a children's picture book. You turn Spanish descriptions into concise, concrete English visual descriptions for an image model.",
  "Rules: keep every concrete visual detail from the Spanish (colours, hairstyles, clothes, marks like freckles or a missing tooth); add only neutral filler needed to make it drawable; never add new story elements.",
  "Never write numbers that force counting (write 'some candles', not 'five candles'). Never ask for text, letters or signs in the image.",
  "No brands, no copyrighted characters, no real famous people.",
  "Answer with one valid JSON object only, no markdown.",
].join("\n");

export function castArtUser(f: Ficha, plan: Plan): string {
  const chips = describeLookEn(f.hero.look);
  const cast = [...f.cast, ...plan.extraCast];
  return [
    "Book cast and settings (Spanish). Produce English descriptions.",
    "",
    `HERO (id hero): ${f.hero.name}, ${f.hero.age} years old, ${heroChildWord(f)}.`,
    chips ? `Fixed features (already decided, do NOT repeat them in identityEn): ${chips}.` : "No fixed features given: choose a simple, natural look (hair colour and style, skin tone, eyes) and describe it in identityEn.",
    f.hero.look.unique ? `Something unique (Spanish): «${f.hero.look.unique}»` : "",
    f.hero.outfit ? `Usual clothes (Spanish): «${f.hero.outfit}»` : "Usual clothes: not given. Choose one concrete, simple, colourful everyday outfit (garments and colours) that suits the story.",
    f.details.length ? `Real details from the parent (Spanish; use only those about looks or clothes): ${f.details.map((d) => `«${d}»`).join(" ")}` : "",
    "",
    cast.length ? "RECURRING CAST:" : "",
    ...cast.map((c: CastMember) => `- ${c.id}: ${c.name || "(no name)"}, ${c.relation || c.kind} (${c.kind}). Look (Spanish): «${c.look || "not given: invent a simple distinctive look"}»`),
    "",
    plan.places.length ? "RECURRING PLACES:" : "",
    ...plan.places.map((p) => `- ${p.id}: ${p.name}: ${p.desc}`),
    plan.objects.length ? "RECURRING OBJECTS:" : "",
    ...plan.objects.map((o) => `- ${o.id}: ${o.name}: ${o.desc}`),
    "",
    `COVER SCENE (Spanish): ${plan.cover}`,
    "",
    "Return JSON with ONE entry for EVERY id listed above (characters, places and objects), all in English:",
    `{"cast":[${["hero", ...cast.map((c) => c.id)].map((id) => `{"id":"${id}","identityEn":"...","outfitEn":"..."}`).join(",")}],"places":{${plan.places.map((p) => `"${p.id}":"..."`).join(",")}},"objects":{${plan.objects.map((o) => `"${o.id}":"..."`).join(",")}},"coverEn":"..."}`,
    "- identityEn: how they look WITHOUT clothes and without their name: apparent age, species/breed for animals, face, hair (shape and colour), skin tone, eyes, glasses, unique marks, build. For the hero, ONLY what is not in the fixed features (face shape, unique marks, build); can be empty.",
    "- outfitEn: usual clothes with garments and colours, lowercase, no final full stop (empty string for animals without clothes). If a recurring object or a real detail is something the hero always wears (a cap worn backwards, a cape, a backpack), include it in the hero's outfitEn so it is on the sheet too.",
    "- coverEn: the cover moment in one or two sentences, with the characters by name.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

export function reviseCastUser(art: CastArt, instruction: string): string {
  return [
    "Current cast descriptions (JSON):",
    JSON.stringify(art.cast.map(({ id, name, identityEn, outfitEn }) => ({ id, name, identityEn, outfitEn }))),
    "",
    `The parent asks for this change to the character sheet (Spanish): «${instruction}»`,
    "Apply the change to the right character, changing as little as possible, and return the full JSON:",
    '{"cast":[{"id":"hero","identityEn":"...","outfitEn":"..."}]}',
  ].join("\n");
}

interface RawCast {
  cast?: { id?: string; identityEn?: string; outfitEn?: string }[];
  places?: Record<string, string>;
  objects?: Record<string, string>;
  coverEn?: string;
}

const s = (v: unknown, max = 1200) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** «A green dress with pockets.» → «a green dress with pockets». */
function phrase(v: string): string {
  const t = v.replace(/[.\s]+$/u, "").trim();
  // «A green dress» → «a green dress»; un nombre propio suelto al principio se respeta
  return t && /^(?:A|An|The|Her|His|Their|One|Some|[A-Z][a-z]+)\s/.test(t) && !/^[A-Z][a-z]+'s\s/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

/** Quita el nombre si el modelo lo puso delante («Carmen, a short…» → «a short…»). */
function withoutName(v: string, name: string): string {
  if (!name) return v;
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return v.replace(new RegExp(`^(?:${esc}\\s*[,:;-]\\s*)+`, "i"), "").trim();
}

const article = (n: number) => (n === 8 || n === 11 || n === 18 ? "an" : "a");

function mergeCast(f: Ficha, plan: Plan, raw: RawCast, prev?: ArtCast[]): ArtCast[] {
  const chips = describeLookEn(f.hero.look);
  const byId = new Map((raw.cast ?? []).map((c) => [c.id, c]));
  const out: ArtCast[] = [];
  const hero = byId.get("hero");
  const prevHero = prev?.find((c) => c.id === "hero");
  // rasgos fijos de los chips + lo que añade el modelo (marcas, cara); el modelo no los reescribe
  const extra = phrase(withoutName(s(hero?.identityEn), f.hero.name));
  const heroIdentity = hero ? [chips, extra].filter(Boolean).join("; ") : prevHero ? bareIdentity(prevHero) : chips;
  out.push({
    id: "hero",
    name: f.hero.name,
    kind: "child",
    identityEn: `${f.hero.name}, ${article(f.hero.age)} ${f.hero.age}-year-old ${heroChildWord(f)}: ${heroIdentity || "a cheerful child"}; ${PROPORTIONS}`,
    outfitEn: phrase(s(hero?.outfitEn)) || prevHero?.outfitEn || "a simple colourful everyday outfit",
  });
  for (const c of [...f.cast, ...plan.extraCast]) {
    const r = byId.get(c.id);
    const before = prev?.find((p) => p.id === c.id);
    const name = c.name || "";
    const desc = phrase(withoutName(s(r?.identityEn), name)) || (before ? bareIdentity(before) : "") || c.look || c.relation;
    out.push({
      id: c.id,
      name: c.name || c.relation,
      kind: c.kind,
      identityEn: `${name ? `${name}, ` : ""}${desc}`,
      outfitEn: phrase(s(r?.outfitEn)) || before?.outfitEn || "",
    });
  }
  return out;
}

/** La descripción sin el nombre ni el prefijo de edad ni las proporciones que añade mergeCast. */
function bareIdentity(c: ArtCast): string {
  return c.identityEn
    .replace(/; children's picture-book proportions.*$/, "")
    .replace(/^[^,:]+, an? \d+-year-old (?:girl|boy|child): /, "")
    .replace(new RegExp(`^${c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},\\s*`), "");
}

export async function castArt(f: Ficha, plan: Plan, llm: Llm = selectLlm("art")): Promise<{ art: CastArt; costCents: number | null }> {
  const key = castArtKey(f, plan);
  if (llm.name === "mock") return { art: mockCastArt(f, plan, key), costCents: 0 };
  const { res, raw } = await completeJson<RawCast>(llm, castArtUser(f, plan), 2000);
  const art: CastArt = {
    key,
    cast: mergeCast(f, plan, raw),
    places: Object.fromEntries(plan.places.map((p) => [p.id, s(raw.places?.[p.id]) || `${p.name}: ${p.desc}`])),
    objects: Object.fromEntries(plan.objects.map((o) => [o.id, s(raw.objects?.[o.id]) || `${o.name}: ${o.desc}`])),
    coverEn: s(raw.coverEn) || plan.cover,
    revisions: [],
  };
  return { art, costCents: llmCostCents(res.model, res.usage) };
}

/** Aplica un cambio con palabras a la hoja («más rizos», «que el perro sea más pequeño»). */
export async function reviseCast(f: Ficha, plan: Plan, art: CastArt, instruction: string, llm: Llm = selectLlm("art")): Promise<{ art: CastArt; costCents: number | null }> {
  if (llm.name === "mock") {
    const cast = art.cast.map((c) => (c.id === "hero" ? { ...c, identityEn: `${c.identityEn}; change requested: ${instruction}` } : c));
    return { art: { ...art, cast, revisions: [...art.revisions, instruction] }, costCents: 0 };
  }
  const bare = { ...art, cast: art.cast.map((c) => ({ ...c, identityEn: bareIdentity(c) })) };
  const { res, raw } = await completeJson<RawCast>(llm, reviseCastUser(bare, instruction), 1500);
  // para el protagonista, el modelo devuelve la descripción completa: se quitan los rasgos fijos para no duplicarlos
  const chips = describeLookEn(f.hero.look);
  const cleaned: RawCast = {
    cast: (raw.cast ?? []).map((c) => (c.id === "hero" && chips ? { ...c, identityEn: s(c.identityEn).replace(chips, "").replace(/^[;,\s]+/, "") } : c)),
  };
  return { art: { ...art, cast: mergeCast(f, plan, cleaned, art.cast), revisions: [...art.revisions, instruction] }, costCents: llmCostCents(res.model, res.usage) };
}

/* ------------------------------ LLM: páginas ------------------------------ */

export function pagesArtUser(f: Ficha, plan: Plan, art: CastArt): string {
  return [
    "Translate each page's illustration brief into English for the image model.",
    `Cast ids: ${art.cast.map((c) => `${c.id} = ${c.name}`).join("; ")}. Refer to characters by name.`,
    "",
    ...plan.pages.map((p) =>
      JSON.stringify({ n: p.n, scene: p.scene, who: p.who, extras: p.extras, outfit: p.outfit, shot: p.shot, time: p.time }),
    ),
    "",
    'Return JSON: {"pages":[{"n":1,"sceneEn":"...","outfitEn":null,"extrasEn":["..."]}]} with all 12 pages.',
    "- sceneEn: one to three sentences: action, pose and expression, setting, key objects. Concrete and drawable as a single moment.",
    "- outfitEn: English for `outfit` when it is not null (the hero's clothes for that page), otherwise null.",
    "- extrasEn: one short English description per extra character.",
  ].join("\n");
}

export function pagesArtKey(cast: CastArt, plan: Pick<Plan, "pages">): string {
  return hashString(JSON.stringify(["pages-art-v1", cast.key, cast.revisions, plan.pages.map((p) => [p.n, p.scene, p.who, p.extras, p.outfit, p.shot, p.time])]));
}

export async function pagesArt(f: Ficha, plan: Plan, cast: CastArt, llm: Llm = selectLlm("art")): Promise<{ art: PagesArt; costCents: number | null }> {
  const key = pagesArtKey(cast, plan);
  if (llm.name === "mock") {
    return { art: { key, pages: plan.pages.map((p) => ({ n: p.n, sceneEn: p.scene, outfitEn: p.outfit, extrasEn: p.extras })) }, costCents: 0 };
  }
  const { res, raw } = await completeJson<{ pages?: { n?: number; sceneEn?: string; outfitEn?: string | null; extrasEn?: string[] }[] }>(llm, pagesArtUser(f, plan, cast), 4000);
  const byN = new Map((raw.pages ?? []).map((p) => [p.n, p]));
  const pages = plan.pages.map((p) => {
    const r = byN.get(p.n);
    return {
      n: p.n,
      sceneEn: s(r?.sceneEn) || p.scene,
      outfitEn: p.outfit ? s(r?.outfitEn) || p.outfit : null,
      extrasEn: p.extras.map((e, i) => s(r?.extrasEn?.[i]) || e),
    };
  });
  return { art: { key, pages }, costCents: llmCostCents(res.model, res.usage) };
}

/* ------------------------------ prompts de imagen ------------------------------ */

function castLine(c: ArtCast, outfit?: string | null): string {
  const clothes = outfit ? `wearing ${outfit} (only the clothes change for this scene; face, hair and body stay identical)` : c.outfitEn ? `wearing ${c.outfitEn}` : "";
  return `${c.identityEn}${clothes ? `, ${clothes}` : ""}`;
}

/** Hoja de reparto 3:2: protagonista arriba (4 vistas + 4 expresiones), recurrentes abajo (2 vistas cada uno). */
export function sheetPrompt(art: CastArt, style: StyleDef): string {
  const [hero, ...rest] = art.cast;
  return [
    `Character reference sheet for a children's picture book, ${style.promptStyle}.`,
    `Landscape 3:2 image, plain warm white background, generous even spacing, every figure fully visible and not overlapping.`,
    `Top two thirds: ${castLine(hero)}. Show ${hero.name} full body in four views (front, three-quarter, side profile, back) and four head-and-shoulders expressions (happy, laughing, surprised, sleepy).`,
    rest.length
      ? `Bottom third, smaller: ${rest.map((c) => `${castLine(c)}, in two views (front and three-quarter)`).join("; ")}.`
      : `Bottom third: two more full-body poses of ${hero.name} (waving, running).`,
    `Keep each character's proportions, face, hair, skin tone, eyes and clothes identical in every view.`,
    STYLE_REF_ONLY,
    NO_TEXT,
  ].join(" ");
}

const LIGHT: Record<string, string> = { dia: "soft daylight", atardecer: "warm golden late-afternoon light", noche: "night, gentle warm lamplight and deep blue shadows" };
const FRAMING: Record<string, string> = { general: "wide shot that shows the whole place", medio: "medium shot, characters full body or waist up", cerca: "close-up on faces and hands" };

function sameAsSheet(names: string[]): string {
  return names.length
    ? `${names.join(" and ")} must look exactly like in the character reference sheet: same face, hair, skin tone, eyes, glasses and proportions.`
    : "";
}

export function coverPrompt(art: CastArt, style: StyleDef): string {
  const recurring = art.cast;
  return [
    `Children's picture book cover illustration, ${style.promptStyle}.`,
    `Scene: ${art.coverEn.replace(/\.?$/, ".")}`,
    `Characters: ${recurring.map((c) => castLine(c)).join("; ")}.`,
    sameAsSheet(recurring.map((c) => c.name)),
    `Landscape 3:2. Inviting, warm and bright; keep the upper third of the image calm and simple (sky, wall or soft background) so the title can sit over it.`,
    STYLE_REF_ONLY,
    NO_TEXT,
  ].join(" ");
}

export function pagePrompt(art: CastArt, page: PlanPage, artPage: ArtPage, style: StyleDef): string {
  const inImage = art.cast.filter((c) => page.who.includes(c.id));
  const absent = art.cast.filter((c) => !page.who.includes(c.id));
  const lines = inImage.map((c) => castLine(c, c.id === "hero" ? artPage.outfitEn : null));
  const place = page.place ? art.places[page.place] : null;
  const objects = page.objects.map((o) => art.objects[o]).filter(Boolean);
  return [
    `Children's picture book illustration, ${style.promptStyle}.`,
    `Scene: ${artPage.sceneEn.replace(/\.?$/, ".")}`,
    place ? `Setting: ${place}.` : "",
    objects.length ? `Recurring objects, keep their colours and features: ${objects.join("; ")}.` : "",
    lines.length ? `Characters in this image: ${lines.join("; ")}.` : "No recurring characters in this image.",
    artPage.extrasEn.length ? `Also in the image, drawn from this description only: ${artPage.extrasEn.join("; ")}.` : "",
    sameAsSheet(inImage.map((c) => c.name)),
    // la hoja trae a todo el reparto y el modelo tiende a meterlo entero (página 1 de Mateo: apareció la gata)
    absent.length ? `${absent.map((c) => c.name).join(" and ")} ${absent.length > 1 ? "are" : "is"} on the reference sheet but must NOT appear in this image.` : "",
    `${FRAMING[page.shot] ?? FRAMING.medio}; ${LIGHT[page.time] ?? LIGHT.dia}.`,
    "Landscape 3:2 composition.",
    STYLE_REF_ONLY,
    NO_TEXT,
  ]
    .filter(Boolean)
    .join(" ");
}

/* ------------------------------ mock ------------------------------ */

function mockCastArt(f: Ficha, plan: Plan, key: string): CastArt {
  const raw: RawCast = {
    cast: [
      { id: "hero", identityEn: f.hero.look.unique ?? "", outfitEn: f.hero.outfit || "a yellow jumper and blue trousers" },
      ...[...f.cast, ...plan.extraCast].map((c) => ({ id: c.id, identityEn: c.look || c.relation, outfitEn: c.kind === "persona" ? "everyday clothes" : "" })),
    ],
  };
  return {
    key,
    cast: mergeCast(f, plan, raw),
    places: Object.fromEntries(plan.places.map((p) => [p.id, `${p.name}: ${p.desc}`])),
    objects: Object.fromEntries(plan.objects.map((o) => [o.id, `${o.name}: ${o.desc}`])),
    coverEn: plan.cover,
    revisions: [],
  };
}

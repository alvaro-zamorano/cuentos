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
const NO_TEXT = "No text, letters, numbers, signs or labels anywhere in the image.";
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
    chips ? `Fixed features already in English (copy them as they are): ${chips}.` : "No fixed features given: choose a simple, natural look and keep it.",
    f.hero.look.unique ? `Something unique (Spanish): «${f.hero.look.unique}»` : "",
    f.hero.outfit ? `Usual clothes (Spanish): «${f.hero.outfit}»` : "Usual clothes: not given. Choose one simple, colourful everyday outfit that suits the story.",
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
    "Return JSON:",
    '{"cast":[{"id":"hero","identityEn":"...","outfitEn":"..."},{"id":"c1","identityEn":"...","outfitEn":"..."}],"places":{"p1":"..."},"objects":{"o1":"..."},"coverEn":"..."}',
    "- identityEn: who they are and how they look WITHOUT clothes: apparent age, species/breed for animals, face, hair (shape and colour), skin tone, eyes, glasses, unique marks, build. For the hero, start with the fixed features.",
    "- outfitEn: usual clothes with colours (empty string for animals without clothes).",
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

function mergeCast(f: Ficha, plan: Plan, raw: RawCast, prev?: ArtCast[]): ArtCast[] {
  const chips = describeLookEn(f.hero.look);
  const byId = new Map((raw.cast ?? []).map((c) => [c.id, c]));
  const out: ArtCast[] = [];
  const hero = byId.get("hero");
  let heroIdentity = s(hero?.identityEn) || prev?.find((c) => c.id === "hero")?.identityEn || "";
  // los rasgos de los chips no pueden faltar aunque el modelo los reescriba
  if (chips && !heroIdentity.toLowerCase().includes(chips.split(",")[0].trim().toLowerCase())) heroIdentity = `${chips}; ${heroIdentity}`;
  out.push({
    id: "hero",
    name: f.hero.name,
    kind: "child",
    identityEn: `${f.hero.name}, a ${f.hero.age}-year-old ${heroChildWord(f)}: ${heroIdentity || chips || "a cheerful child"}; ${PROPORTIONS}`,
    outfitEn: s(hero?.outfitEn) || prev?.find((c) => c.id === "hero")?.outfitEn || "a simple colourful everyday outfit",
  });
  for (const c of [...f.cast, ...plan.extraCast]) {
    const r = byId.get(c.id);
    const before = prev?.find((p) => p.id === c.id);
    out.push({
      id: c.id,
      name: c.name || c.relation,
      kind: c.kind,
      identityEn: `${c.name ? `${c.name}, ` : ""}${s(r?.identityEn) || before?.identityEn || c.look || c.relation}`,
      outfitEn: s(r?.outfitEn) || before?.outfitEn || "",
    });
  }
  return out;
}

/** Quita el nombre y las proporciones que mergeCast antepone/añade, para devolver al LLM solo la descripción. */
function bareIdentity(c: ArtCast): string {
  return c.identityEn.replace(/; children's picture-book proportions.*$/, "");
}

export async function castArt(f: Ficha, plan: Plan, llm: Llm = selectLlm("art")): Promise<{ art: CastArt; costCents: number | null }> {
  const key = castArtKey(f, plan);
  if (llm.name === "mock") return { art: mockCastArt(f, plan, key), costCents: 0 };
  const res = await llm.complete({ system: ART_SYSTEM, messages: [{ role: "user", content: castArtUser(f, plan) }], maxTokens: 2000, temperature: 0.3 });
  const raw = extractJsonObject(res.raw) as RawCast;
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
  const res = await llm.complete({ system: ART_SYSTEM, messages: [{ role: "user", content: reviseCastUser(bare, instruction) }], maxTokens: 1500, temperature: 0.2 });
  const raw = extractJsonObject(res.raw) as RawCast;
  // el nombre ya va dentro de identityEn devuelto; se quita para no duplicarlo al recomponer
  const cleaned: RawCast = {
    cast: (raw.cast ?? []).map((c) => {
      const name = art.cast.find((x) => x.id === c.id)?.name ?? "";
      const id = s(c.identityEn).replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},\\s*(a [0-9]+-year-old [a-z]+:\\s*)?`), "");
      return { ...c, identityEn: id };
    }),
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
  const res = await llm.complete({ system: ART_SYSTEM, messages: [{ role: "user", content: pagesArtUser(f, plan, cast) }], maxTokens: 4000, temperature: 0.3 });
  const raw = extractJsonObject(res.raw) as { pages?: { n?: number; sceneEn?: string; outfitEn?: string | null; extrasEn?: string[] }[] };
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
      { id: "hero", identityEn: describeLookEn(f.hero.look) || "a cheerful child", outfitEn: f.hero.outfit || "a yellow jumper and blue trousers" },
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

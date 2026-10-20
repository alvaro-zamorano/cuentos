/**
 * Lo que salió mal en el libro de Olivia (18 oct): el planificador inventó a «la abuela», la capa y la corona salieron
 * desde la página 1 aunque llegan en la 5 y la 11, y el perro «asomado tras el sofá» lo atravesaba. Sin red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { castArt, castArtUser, pagePrompt, pagesArtUser, redoSceneUser } from "../../lib/plan/art";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { plannerSystem } from "../../lib/plan/prompt";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { familyIn, inventedFamily, validatePlan } from "../../lib/plan/validate";
import { getStyle } from "../../lib/generation/styles";
import type { Ficha, Plan } from "../../lib/plan/types";

const olivia: Ficha = normalizeFicha({
  idea: "Olivia acaba de llegar a la tierra y poco a poco conquista el mundo",
  hero: { name: "Olivia", age: 2, gender: "nina", look: { hair: { color: "negro", shape: "ondulado" }, skin: "muy-clara", eyes: "marron", unique: "es pequeña" }, outfit: "Vestido verde" },
  cast: [{ id: "c1", kind: "mascota", name: "Topito", relation: "perro", look: "es un miniature Pinscher" }],
  details: [],
  styleId: "gouache",
  seed: 1,
});

function withAbuela(base: Plan): Plan {
  const pages = base.pages.map((p) => (p.n === 5 ? { ...p, text: "La abuela le trae una capa roja. Olivia se la pone.", who: [...p.who, "c2" as const] } : p));
  return { ...base, extraCast: [{ id: "c2", kind: "persona", name: "la abuela", relation: "abuela de Olivia", look: "pelo corto plateado y gafas redondas" }], pages };
}

test("familia: el planificador no puede inventar familiares; los que pone el adulto sí valen", () => {
  assert.deepEqual([...familyIn("La abuela y su mamá; el tío Paco")].sort(), ["abuelos", "madre", "tíos"]);
  assert.deepEqual([...familyIn("Papá Noel trae regalos")], [], "Papá Noel es de tradición");
  assert.deepEqual([...familyIn("Tiovivo, primavera, mamut")], [], "solo palabras enteras");

  const plan = withAbuela(mockPlan(olivia));
  assert.deepEqual(inventedFamily(plan, olivia), ["abuelos"]);
  const v = validatePlan(plan, olivia);
  assert.ok(v.issues.some((i) => i.hard && /familiares que el adulto no ha puesto \(abuelos\)/.test(i.msg)), JSON.stringify(v.issues));

  // si el adulto la nombra (idea, detalles, reparto o quien lo regala), sí puede salir
  assert.deepEqual(inventedFamily(plan, { ...olivia, idea: "Olivia y su abuela conquistan el mundo" }), []);
  assert.deepEqual(inventedFamily(plan, { ...olivia, from: "La yaya Carmen" }), []);
  assert.deepEqual(inventedFamily(plan, { ...olivia, cast: [...olivia.cast, { id: "c2", kind: "persona", name: "Carmen", relation: "abuela", look: "" }] }), []);

});

test("ropa: lo que el protagonista recibe más tarde no va en su ropa habitual", () => {
  const base = mockPlan(olivia);
  const plan: Plan = {
    ...base,
    objects: [
      { id: "o1", name: "la capa", desc: "una capa roja con un lazo dorado" },
      { id: "o2", name: "la corona", desc: "una corona de cartón dorado con una estrella" },
    ],
    pages: base.pages.map((p) => ({ ...p, objects: p.n >= 11 ? ["o1", "o2"] : p.n >= 5 ? ["o1"] : [] })),
  };
  const user = castArtUser(olivia, plan);
  assert.match(user, /o1: la capa: .*\(first appears on page 5: NOT part of the usual clothes\)/);
  assert.match(user, /o2: la corona: .*\(first appears on page 11: NOT part of the usual clothes\)/);
  assert.match(user, /Never include an object marked as NOT part of the usual clothes/);
  // un objeto que está desde la página 1 sí puede ir en la ropa
  const fromStart = castArtUser(olivia, { ...plan, pages: plan.pages.map((p) => ({ ...p, objects: ["o1"] })) });
  assert.doesNotMatch(fromStart, /o1: la capa: [^\n]*NOT part/);
});

test("escenas: nadie medio tapado por un mueble, personajes sólidos y gafas solo si alguien las lleva", async () => {
  const plan = mockPlan(olivia);
  assert.match(pagesArtUser(olivia, plan, (await castArt(olivia, plan, MOCK_LLM)).art), /never partly hidden behind, under or inside furniture/);
  assert.match(plannerSystem(), /nada de asomarse tras un mueble/);
  assert.match(plannerSystem(), /no inventes familiares/);
  assert.doesNotMatch(plannerSystem(), /también mamá o papá/);

  const { art } = await castArt(olivia, plan, MOCK_LLM);
  const style = getStyle("gouache")!;
  const p = { ...plan.pages[2], who: ["hero", "c1"] as Plan["pages"][number]["who"] };
  const prompt = pagePrompt(art, p, { n: 3, sceneEn: "Topito stands beside the blue sofa, wagging his tail, facing Olivia", outfitEn: null, extrasEn: [] }, style);
  assert.match(prompt, /never pass through or merge with furniture or objects/);
  assert.match(prompt, /same face, hair, skin tone, eyes and proportions\./, "sin gafas en el reparto, no se nombran");
  assert.doesNotMatch(prompt, /glasses/);

  // Vera lleva gafas: entonces sí
  const vera = normalizeFicha(EVAL_CASES[0]);
  const veraPlan = mockPlan(vera);
  const veraArt = (await castArt(vera, veraPlan, MOCK_LLM)).art;
  const vp = pagePrompt(veraArt, veraPlan.pages[0], { n: 1, sceneEn: "Vera jumps out of bed", outfitEn: null, extrasEn: [] }, style);
  assert.match(vp, /eyes, glasses and proportions\./);
});

test("otra versión con motivo: el modelo recibe la escena, quién sale, el motivo y las palabras del padre", async () => {
  const plan = mockPlan(olivia);
  const { art } = await castArt(olivia, plan, MOCK_LLM);
  const u = redoSceneUser(art, { who: ["hero", "c1"] }, { n: 3, sceneEn: "Topito peeks out from behind the sofa", outfitEn: null, extrasEn: [] }, "Postura o cuerpo raro", "el perro atraviesa el sofá");
  assert.match(u, /Current scene \(English\): Topito peeks out from behind the sofa/);
  assert.match(u, /Characters that must appear: Olivia, Topito\./);
  assert.match(u, /«Postura o cuerpo raro»/);
  assert.match(u, /«el perro atraviesa el sofá»/);
  assert.match(u, /every character fully visible/);
  assert.doesNotMatch(redoSceneUser(art, { who: ["hero"] }, { n: 3, sceneEn: "x", outfitEn: null, extrasEn: [] }, "Otra cosa", null), /own words/);
});

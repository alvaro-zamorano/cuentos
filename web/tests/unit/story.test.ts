/**
 * Tests unitarios del motor de historia (sin red, sin claves): npm run test:unit
 * Se ejecutan con node --test y tsx (ya en devDependencies) para importar TypeScript.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_DRAFT, buildBook } from "../../lib/story";
import { storyInputHash } from "../../lib/story/hash";
import { composeMockStory } from "../../lib/story/mock";
import { selectProvider } from "../../lib/story/provider";
import { generateStory } from "../../lib/story/generate";
import { promptFor, storyInputFromDraft } from "../../lib/story/spec";
import { extractJson, validateStory, type StoryOutput } from "../../lib/story/validate";
import type { Draft } from "../../lib/types";

const TWO = ["Le encantan los trenes de mercancías", "Siempre dice «otra vez» cuando algo le gusta"];
const FIVE = [
  "Los trenes y las vías de madera",
  "Dice «a la de una, a la de dos» antes de saltar desde el sofá al cojín grande del salón",
  "El parque de los patos, al lado del Retiro, donde le dan pan a los patos los domingos por la mañana con su abuelo",
  "Ponerse las botas de agua aunque no llueva",
  "Su prima Lola, que le enseña a hacer volteretas",
];

function draft(p: Partial<Draft> & { name: string; age: number }): Draft {
  return { ...DEFAULT_DRAFT, ...p, hero: { ...DEFAULT_DRAFT.hero, name: p.name, age: p.age } };
}

const CASES: [string, Draft][] = [
  ["2-4, solo, 2 detalles", draft({ name: "Vera", age: 3, details: TWO, special: "coches" })],
  ["2-4, perro con nombre, 5 detalles", draft({ name: "Mateo", age: 4, details: FIVE, special: "peluche", companion: { kind: "perro", name: "Toby", variant: "corgi" } })],
  ["2-4, hermana sin nombre, 5 detalles", draft({ name: "Ana María", age: 2, details: FIVE, special: "estrellas", companion: { kind: "hermana" } })],
  ["5-8, abuela con nombre, 2 detalles", draft({ name: "Lucas", age: 6, details: TWO, special: "dinosaurios", companion: { kind: "abuela", name: "Pili", variant: "abuela-gafas" } })],
  ["5-8, solo, 5 detalles", draft({ name: "Irene", age: 8, details: FIVE, special: "mariposas" })],
  ["5-8, gato, 2 detalles", draft({ name: "Leo", age: 5, details: ["La canción del Cola Cao", "Hacer cabañas con mantas"], special: "chocolate", companion: { kind: "gato", name: "Misi" } })],
];

for (const [label, d] of CASES) {
  test(`mock pasa la validación: ${label}`, () => {
    const input = storyInputFromDraft(d);
    const out = composeMockStory(input);
    const v = validateStory(out, input);
    assert.deepEqual(v.issues, [], v.issues.join("\n"));
    assert.equal(v.ok, true);
    // los detalles no entran ni en la primera ni en la última página
    for (const n of [1, 12]) assert.ok(!/Lola|otra vez|mercancías/.test(out.pages[n - 1].text));
  });
}

test("mock: determinista y distinto con otra semilla", () => {
  const d = CASES[3][1];
  const a = composeMockStory(storyInputFromDraft(d));
  const b = composeMockStory(storyInputFromDraft(d));
  assert.deepEqual(a, b);
  const c = composeMockStory(storyInputFromDraft({ ...d, storySeed: 1 }));
  assert.ok(a.pages.some((p, i) => p.text !== c.pages[i].text));
  assert.notEqual(storyInputHash(d), storyInputHash({ ...d, storySeed: 1 }));
});

test("buildBook usa la historia si el hash coincide y el arco si no", async () => {
  const d = CASES[3][1];
  const { provider } = selectProvider({});
  const res = await generateStory(d, provider);
  assert.equal(res.fallback, false);
  assert.equal(res.provider, "mock");
  const withStory: Draft = { ...d, story: res.story };
  assert.equal(buildBook(withStory).title, res.story.title);
  assert.equal(buildBook(withStory).pages[4].text, res.story.pages[4].text);
  // cambia un detalle: la historia ya no vale y se cae al arco
  const changed: Draft = { ...withStory, details: [...d.details, "Las ranas del estanque"] };
  assert.equal(buildBook(changed).title, "El cumpleaños de Lucas");
  // los textos editados se aplican encima
  assert.equal(buildBook({ ...withStory, textOverrides: { 2: "Editado." } }).pages[1].text, "Editado.");
  // scenePrompt en inglés con rasgos y sin texto en la imagen
  assert.match(res.story.pages[0].scenePrompt, /No text, letters or numbers in the image\.$/);
});

test("selectProvider: sin clave cae a mock y deja constancia de lo pedido", () => {
  const r = selectProvider({ STORY_PROVIDER: "anthropic" });
  assert.equal(r.provider.name, "mock");
  assert.equal(r.requested, "anthropic");
  assert.equal(selectProvider({ STORY_PROVIDER: "openai", OPENAI_API_KEY: "x" }).provider.name, "openai");
});

test("selectProvider: sin STORY_PROVIDER, la clave de Anthropic basta; STORY_PROVIDER=mock la ignora", () => {
  assert.equal(selectProvider({ ANTHROPIC_API_KEY: "x" }).provider.name, "anthropic");
  assert.equal(selectProvider({ ANTHROPIC_API_KEY: "x", STORY_PROVIDER: "mock" }).provider.name, "mock");
  assert.equal(selectProvider({ OPENAI_API_KEY: "x" }).provider.name, "mock");
});

test("promptFor: reglas en system, detalles tal cual y JSON estricto en user", () => {
  const input = storyInputFromDraft(CASES[1][1]);
  const { system, user } = promptFor(input, ["Página 3: 40 palabras"]);
  assert.match(system, /solo con un objeto JSON válido/);
  assert.match(system, /entre 12 y 28 palabras/);
  for (const d of FIVE) assert.ok(user.includes(`«${d}»`));
  assert.match(user, /Corrige esto:\n- Página 3: 40 palabras/);
  assert.match(user, /su perro Toby \(mascota: no habla\)/);
});

test("extractJson tolera texto y bloque de código alrededor", () => {
  assert.deepEqual(extractJson('Aquí está:\n```json\n{"a": 1}\n```'), { a: 1 });
  assert.throws(() => extractJson("sin json"));
});

// ---- el validador rechaza ----
const base = () => {
  const input = storyInputFromDraft(CASES[3][1]);
  return { input, out: JSON.parse(JSON.stringify(composeMockStory(input))) as StoryOutput };
};

test("validador rechaza una página de más", () => {
  const { input, out } = base();
  out.pages.push({ ...out.pages[11], n: 13 });
  const v = validateStory(out, input);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => /12 páginas/.test(i)));
});

test("validador rechaza emojis", () => {
  const { input, out } = base();
  out.pages[2].text += " 🎈";
  const v = validateStory(out, input);
  assert.ok(v.issues.some((i) => /Página 3: contiene emojis/.test(i)));
});

test("validador rechaza un nombre no permitido", () => {
  const { input, out } = base();
  out.pages[6].text = out.pages[6].text.replace("Por la tarde fueron todos", "Por la tarde fueron con Martina");
  const v = validateStory(out, input);
  assert.ok(v.issues.some((i) => /Página 7: nombres no permitidos \(Martina\)/.test(i)), v.issues.join("\n"));
});

test("validador rechaza longitudes fuera de rango", () => {
  const { input, out } = base();
  out.pages[0].text = "Hoy es su cumpleaños.";
  out.pages[1].text = Array.from({ length: 70 }, () => "palabra").join(" ") + ".";
  const v = validateStory(out, input);
  assert.ok(v.issues.some((i) => /Página 1: 4 palabras/.test(i)));
  assert.ok(v.issues.some((i) => /Página 2: 70 palabras/.test(i)));
  // 2–4 años: frases de 9 palabras como máximo
  const small = storyInputFromDraft(CASES[0][1]);
  const o2 = composeMockStory(small);
  o2.pages[2].text = "En la cocina hay una sorpresa enorme y muy bonita para Vera hoy.";
  assert.ok(validateStory(o2, small).issues.some((i) => /frase de más de 9 palabras/.test(i)));
});

test("validador rechaza detalles ausentes y lista negra", () => {
  const input = storyInputFromDraft(CASES[4][1]);
  const out = composeMockStory(storyInputFromDraft({ ...CASES[4][1], details: [] }));
  const v = validateStory(out, input);
  assert.ok(v.issues.some((i) => /Aparecen 0 detalles reales; tienen que aparecer al menos 3/.test(i)), v.issues.join("\n"));
  const o2 = composeMockStory(input);
  o2.pages[4].text += " Le dio miedo.";
  assert.ok(validateStory(o2, input).issues.some((i) => /palabra no permitida «miedo»/.test(i)));
});

test("generateStory: reintenta una vez con los motivos y, si vuelve a fallar, devuelve el arco", async () => {
  const d = CASES[3][1];
  const calls: (string[] | undefined)[] = [];
  const good = JSON.stringify(composeMockStory(storyInputFromDraft(d)));
  const flaky = {
    name: "anthropic" as const,
    async generate(_input: unknown, opts?: { issues?: string[] }) {
      calls.push(opts?.issues);
      return { raw: calls.length === 1 ? '{"title": "x", "pages": []}' : `Aquí va: ${good}`, model: "test" };
    },
  };
  const ok = await generateStory(d, flaky);
  assert.equal(ok.fallback, false);
  assert.equal(ok.attempts, 2);
  assert.equal(calls[0], undefined);
  assert.ok(calls[1]?.some((i) => /12 páginas/.test(i)));

  const broken = { name: "openai" as const, async generate() { return { raw: "no es json", model: "test" }; } };
  const fb = await generateStory(d, broken);
  assert.equal(fb.fallback, true);
  assert.equal(fb.attempts, 2);
  assert.equal(fb.story.fallback, true);
  assert.equal(fb.story.title, "El cumpleaños de Lucas");
  assert.equal(fb.story.inputHash, storyInputHash(d));
});

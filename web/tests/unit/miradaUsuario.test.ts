/**
 * Lo que quedaba de la «Mirada de usuario crítico» de la auditoría del 26 oct (28 oct): lo que tiene lógica, sin
 * navegador. Lo visual va en Playwright y en capturas.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { STARTERS, starterIdea } from "../../lib/plan/starters";
import { normalizeFicha } from "../../lib/plan/ficha";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { viewErrorMessage } from "../../lib/bookClient";

const ficha = normalizeFicha(EVAL_CASES[0]);

test("una idea de ocasión sin nombre empieza en mayúscula; con nombre, como siempre", () => {
  for (const s of STARTERS) {
    const idea = starterIdea(s.id, "")!;
    assert.equal(idea[0], idea[0].toUpperCase(), `${s.id}: ${idea.slice(0, 30)}`);
  }
  // antes: «nuestro protagonista pasa el fin de semana…»
  assert.match(starterIdea("abuelos", "")!, /^Nuestro protagonista pasa el fin de semana/);
  assert.match(starterIdea("abuelos", "Vera")!, /^Vera pasa el fin de semana/);
  assert.equal(starterIdea("navidad", "Vera"), "La noche de Nochebuena, Vera oye un ruido en el tejado y sube a ver quién anda por ahí.");
});

test("el enlace caducado dice qué hacer, no solo qué pasa", () => {
  const m = viewErrorMessage("not_found");
  assert.match(m, /escríbenos/);
  assert.match(m, /empezar otro cuento/);
});

/** localStorage de mentira para el almacén del navegador. */
async function withStorage<T>(fn: (data: Map<string, string>) => Promise<T>): Promise<T> {
  const data = new Map<string, string>();
  const g = globalThis as unknown as { localStorage?: unknown };
  const before = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  try {
    return await fn(data);
  } finally {
    g.localStorage = before;
  }
}

test("el género: un borrador nuevo no lo da por elegido; uno que ya pasó del paso 1, sí", async () => {
  await withStorage(async (data) => {
    const { read } = await import("../../lib/crearStore");
    assert.equal(read().genderChosen, undefined, "vacío: no hay ninguno marcado");
    data.set("cuentos:crear:v2", JSON.stringify({ v: 2, step: 1, ficha }));
    assert.equal(read().genderChosen, undefined, "en el paso 1, todavía no");
    data.set("cuentos:crear:v2", JSON.stringify({ v: 2, step: 3, ficha }));
    assert.equal(read().genderChosen, true, "lo de antes de este cambio que ya siguió: lo eligió o lo aceptó");
    data.set("cuentos:crear:v2", JSON.stringify({ v: 2, step: 1, ficha, genderChosen: true }));
    assert.equal(read().genderChosen, true);
  });
});

test("abrir el enlace de otro libro guarda aparte lo que había, en una lista, y se puede volver a ello", async () => {
  await withStorage(async (data) => {
    const { unsavedWork, worthKeeping, sameDraft, addAside, removeAside, readAsides, ASIDE_MAX } = await import("../../lib/crearStore");
    const draft = (name: string) => ({ v: 2 as const, step: 3 as const, ficha: { ...ficha, hero: { ...ficha.hero, name } } });
    const martina = draft("Martina");
    assert.equal(unsavedWork(martina), true);
    assert.equal(unsavedWork({ ...martina, bookId: "abcd2345ef" }), false, "con libro en el servidor vuelve con su enlace");
    assert.equal(worthKeeping({ ...martina, bookId: "abcd2345ef" }), true, "pero se guarda aparte igual: no depende del email");
    assert.equal(worthKeeping({ v: 2, step: 1, ficha: normalizeFicha({}) }), false, "nada escrito, nada que guardar");

    // revisión independiente: un segundo cuento apartado no borra el primero
    addAside(martina);
    addAside(draft("Pablo"));
    assert.deepEqual(readAsides().map((d) => d.ficha.hero.name), ["Pablo", "Martina"]);
    // el mismo otra vez sube, no se repite
    addAside(martina);
    assert.deepEqual(readAsides().map((d) => d.ficha.hero.name), ["Martina", "Pablo"]);
    // un libro, por su id aunque cambie el texto
    addAside({ ...draft("Lucas"), bookId: "abcd2345ef" });
    addAside({ ...draft("Lucas cambiado"), bookId: "abcd2345ef" });
    assert.deepEqual(readAsides().map((d) => d.ficha.hero.name), ["Lucas cambiado", "Martina", "Pablo"]);
    assert.equal(readAsides()[0].bookId, "abcd2345ef");
    assert.ok(sameDraft(readAsides()[1], martina));
    removeAside(martina);
    assert.deepEqual(readAsides().map((d) => d.ficha.hero.name), ["Lucas cambiado", "Pablo"]);
    // como mucho ASIDE_MAX: se va el más antiguo
    const names = ["Ana", "Bea", "Carla", "Dani", "Eva", "Fran", "Gael"];
    for (const n of names) addAside(draft(n));
    assert.equal(readAsides().length, ASIDE_MAX);
    assert.equal(readAsides()[0].ficha.hero.name, "Gael");
    // lo caducado (30 días) se va al leer
    const old = Date.now() - 31 * 24 * 3600 * 1000;
    data.set("cuentos:crear:v2:aparte", JSON.stringify([{ ...martina, savedAt: old }, { ...draft("Pablo"), savedAt: Date.now() }]));
    assert.deepEqual(readAsides().map((d) => d.ficha.hero.name), ["Pablo"]);
    assert.equal(JSON.parse(data.get("cuentos:crear:v2:aparte")!).length, 1, "y se borra");
  });
});

/**
 * Lo que escribe el padre en el paso 3 cuenta como suyo (auditoría 26 oct, B6): «que salga la abuela» o «Mamá le dio un
 * beso» ya no acaban en un 422 al dibujar, los problemas se le dicen con palabras para personas y el modelo sigue sin
 * poder inventar familia. Sin red: memoria, dry-run y un modelo de mentira.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM, type Llm } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { savePlan, startBook } from "../../lib/book/service";
import { familyMentions, validatePlan } from "../../lib/plan/validate";
import { rewritePage } from "../../lib/plan/planner";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import type { Plan } from "../../lib/plan/types";

const ficha = normalizeFicha(EVAL_CASES[0]); // Vera y su perro Toby: ningún familiar en la ficha
const base = mockPlan(ficha);
const withText = (plan: Plan, n: number, text: string): Plan => ({ ...plan, pages: plan.pages.map((p) => (p.n === n ? { ...p, text } : p)) });

test("un familiar que escribe el padre en el texto cuenta como suyo; el que pone el modelo, no", () => {
  const edited = withText(base, 3, `${base.pages[2].text} Mamá le dio un beso.`);
  assert.equal(validatePlan(edited, ficha).usable, false, "al escribir el plan, el modelo no puede inventar a mamá");
  const v = validatePlan(edited, ficha, { fromParent: true });
  assert.equal(v.usable, true, JSON.stringify(v.issues.filter((i) => i.hard)));
  // lo que el padre no escribe (los extras de cada página) sigue sin poder traer familia que no está en ningún sitio
  const extras = { ...base, pages: base.pages.map((p) => (p.n === 4 ? { ...p, extras: ["su tía con un paraguas"] } : p)) };
  assert.equal(validatePlan(extras, ficha, { fromParent: true }).usable, false);
  // pero si la tía ya está en el texto del padre, puede salir también en el dibujo de esa página
  assert.equal(validatePlan(withText(extras, 4, `${base.pages[3].text} Llegó su tía.`), ficha, { fromParent: true }).usable, true);
});

test("«que salga la abuela» en el paso 3 ya no bloquea «Dibujar» (antes, 422 con un mensaje para el modelo)", async () => {
  const store = memoryStore(newMemoryState());
  const page = await rewritePage(ficha, base, 4, "que salga la abuela", MOCK_LLM);
  assert.ok(page.ok);
  const plan = { ...base, pages: base.pages.map((p) => (p.n === 4 ? page.page : p)) };
  assert.match(plan.pages[3].text, /abuela/);
  const r = await startBook(store, { email: "abril@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(r.ok, JSON.stringify(r));
});

test("lo que no vale se le dice al padre con palabras para personas, nunca con el mensaje para el modelo", async () => {
  const store = memoryStore(newMemoryState());
  const start = await startBook(store, { email: "abril@example.com", ficha, plan: base, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  const reason = async (plan: Plan) => {
    const r = await savePlan(store, { bookId: start.bookId, plan });
    assert.equal((r as { status: number }).status, 422, JSON.stringify(r));
    return (r as { reason: string }).reason;
  };
  assert.equal(await reason(withText(base, 2, `${base.pages[1].text} 🚀`)), "Quita el emoji de la página 2: no se puede imprimir.");
  assert.match(await reason(withText(base, 5, `${base.pages[4].text} Llevaba su gorra de Frozen.`)), /^«Frozen» es una marca o un personaje con derechos y no lo podemos poner en el libro\. Cámbialo en la página 5/);
  assert.equal(await reason(withText(base, 7, "")), "Falta el texto de la página 7.");
  // y lo que sí vale se guarda: mamá, escrita por el padre
  assert.deepEqual(await savePlan(store, { bookId: start.bookId, plan: withText(base, 3, `${base.pages[2].text} Mamá le dio un beso.`) }), { ok: true });
});

test("al reescribir una página, el modelo no puede traer familiares que nadie ha pedido: se le pide otra vez", async () => {
  const p4 = base.pages[3];
  const replies = [
    { ...p4, text: `${p4.text} Y llegó su tía con una tarta.`, n: 4 },
    { ...p4, text: `${p4.text} Y era de noche.`, n: 4 },
  ];
  const asked: string[] = [];
  const llm: Llm = {
    name: "anthropic",
    model: "de-mentira",
    complete: async (req) => {
      asked.push(req.messages[req.messages.length - 1].content as string);
      return { raw: JSON.stringify(replies[Math.min(asked.length - 1, 1)]), model: "de-mentira", usage: { input: 1, output: 1 }, ms: 1 };
    },
  };
  const r = await rewritePage(ficha, base, 4, "que sea de noche", llm);
  assert.ok(r.ok, JSON.stringify(r));
  assert.match(r.page.text, /era de noche/);
  assert.equal(asked.length, 2);
  assert.match(asked[1], /familiares que el adulto no ha puesto \(tíos\)/);

  // si lo pide el padre, vale a la primera
  const one = { ...llm, complete: async () => ({ raw: JSON.stringify(replies[0]), model: "de-mentira", usage: { input: 1, output: 1 }, ms: 1 }) };
  const ok = await rewritePage(ficha, base, 4, "que salga su tía con una tarta", one);
  assert.ok(ok.ok, JSON.stringify(ok));
});

test("familyMentions: la palabra que ha escrito, una por parentesco, sin Papá Noel", () => {
  assert.deepEqual(familyMentions("Su Abuela y su abuelo bailaron. Mamá también."), [
    { kin: "abuelos", word: "abuela" },
    { kin: "madre", word: "mamá" },
  ]);
  assert.deepEqual(familyMentions("Papá Noel trajo un trineo."), []);
});

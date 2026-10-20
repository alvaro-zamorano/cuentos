import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyFicha, LIMITS } from "../../lib/plan/ficha";
import { emptyQuickAnswers, mergeDetails, needsQuickQuestions, quickDetails, quickQuestions } from "../../lib/plan/quick";
import { starterIdea } from "../../lib/plan/starters";
import type { Ficha } from "../../lib/plan/types";

const ficha = (patch: Partial<Ficha> = {}): Ficha => {
  const f = emptyFicha();
  return { ...f, ...patch, hero: { ...f.hero, name: "Olivia", age: 2, gender: "nina", ...patch.hero } };
};

test("tres preguntas: salen con la ficha pobre", () => {
  assert.equal(needsQuickQuestions(ficha()), true, "sin idea («Sorpréndeme»)");
  assert.equal(needsQuickQuestions(ficha({ idea: "Olivia acaba de llegar a la tierra y poco a poco conquista el mundo" })), true, "13 palabras");
  const luna = starterIdea("luna", "Olivia")!;
  assert.equal(needsQuickQuestions(ficha({ starter: "luna", idea: luna })), true, "idea de arranque sin tocar");
});

test("tres preguntas: no salen si ya hay material", () => {
  assert.equal(needsQuickQuestions(ficha({ details: ["dice «mío» a todo"] })), false, "con un detalle");
  assert.equal(needsQuickQuestions(ficha({ details: ["  ", ""] })), true, "detalles vacíos no cuentan");
  const larga = "Olivia vive en Lavapiés con su perro Topito y cada domingo baja al mercado con la abuela a comprar mandarinas y saludar al frutero";
  assert.equal(needsQuickQuestions(ficha({ idea: larga })), false, "idea propia larga");
  const luna = starterIdea("luna", "Olivia")!;
  assert.equal(needsQuickQuestions(ficha({ starter: "luna", idea: `${luna} Con su perro Topito, que ladra a las estrellas y se come las galletas de la abuela.` })), false, "arranque retocado y largo");
});

test("tres preguntas: banco por edad", () => {
  const small = quickQuestions(2);
  const big = quickQuestions(6);
  assert.deepEqual(small.map((q) => q.id), ["gusta", "frase", "aprende"]);
  assert.ok(small[2].chips.includes("dar palmas"));
  assert.ok(big[2].chips.includes("montar en bici"));
  assert.ok(!big[2].chips.includes("dejar el pañal"));
  for (const q of [...small, ...big]) assert.ok(q.ask.length < 60 && !/[—–]/.test(q.ask + q.lead + q.placeholder));
});

test("tres preguntas: respuestas a detalles", () => {
  const a = emptyQuickAnswers();
  assert.deepEqual(quickDetails(2, a), [], "sin respuestas, nada");
  a.gusta = { chips: ["los animales", "el agua"], text: "meter cosas en cajas " };
  a.frase.text = "dice «¡mío!» a todo";
  const d = quickDetails(2, a);
  assert.deepEqual(d, ["Lo que más le gusta: los animales, el agua, meter cosas en cajas", "Frase o manía suya: dice «¡mío!» a todo"]);
  a.aprende.text = "x".repeat(400);
  assert.ok(quickDetails(2, a).every((l) => l.length <= LIMITS.detail));
  assert.deepEqual(mergeDetails(["", "su capa roja", " "], d), ["su capa roja", ...d]);
  assert.equal(mergeDetails(["a", "b", "c", "d"], d).length, LIMITS.details);
});

/** Esperas: la frase del cuento que se enseña mientras se pinta. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { firstSentence } from "@/lib/waiting";

test("toma la primera frase de la página", () => {
  assert.equal(firstSentence("Aquella noche, Vera no tenía nada de sueño. Desde la ventana, la Luna brillaba."), "Aquella noche, Vera no tenía nada de sueño.");
});

test("con diálogo, corta en el cierre de la frase y no a mitad", () => {
  assert.equal(firstSentence("—¡Allí está! —dijo Vera. Toby ladró."), "—¡Allí está!");
  assert.equal(firstSentence("Se llamará «Dino-1». Toby lo aprobó."), "Se llamará «Dino-1».");
});

test("sin punto, el texto entero; muy larga, cortada en una palabra con puntos suspensivos", () => {
  assert.equal(firstSentence("  Una frase   sin punto  "), "Una frase sin punto");
  const long = firstSentence(`${"palabra ".repeat(40)}fin.`, 60);
  assert.ok(long.length <= 60);
  assert.ok(long.endsWith("…"));
  assert.ok(!long.includes("palabr…"));
});

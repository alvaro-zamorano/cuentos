/** Capitular del texto de cada página: solo con letra o número; con comillas u otro signo delante, sin capitular. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { storyHtml } from "../../lib/pdf/printHtml";

const capOf = (t: string) => storyHtml(t).match(/<span class="cap">(.*?)<\/span>/)?.[1] ?? null;

test("capitular: la primera letra", () => {
  assert.equal(capOf("Volvieron al barco cargados de monedas."), "V");
  assert.equal(capOf("Érase una vez"), "É");
  assert.equal(capOf("3 piratas subieron"), "3");
});

test("capitular: con raya de diálogo, la letra que sigue", () => {
  assert.equal(capOf("—Hola —dijo Vera."), "H");
});

test("capitular: sin capitular si empieza por comillas o signos", () => {
  for (const t of ["«Capitán Test», dijo la tripulación.", "“Hola”, dijo.", '"Hola", dijo.', "¿Dónde está?", "¡Al agua!", "(Era de noche.)", "…y entonces"]) {
    assert.equal(capOf(t), null, t);
    assert.ok(storyHtml(t).startsWith("<p>"), t);
  }
});

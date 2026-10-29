/**
 * Ejemplos de «Quién más sale» (#54, 29 oct): uno de cada (abuelo, abuela, mamá, papá, hermana y bebé), con su miniatura
 * y su fuente en el repo, y un texto que dice la piel, como en el dibujo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PERSON_PICKS, PET_PICKS } from "../../lib/crearPicks";

const web = join(__dirname, "..", "..");

test("los ejemplos de personas son uno de cada, con miniatura, fuente y la piel en el texto", () => {
  assert.deepEqual(
    PERSON_PICKS.map((p) => p.label),
    ["Abuelo", "Abuela", "Mamá", "Papá", "Hermana", "Bebé"],
  );
  for (const p of PERSON_PICKS) {
    assert.ok(existsSync(join(web, "public", p.src)), `falta ${p.src}`);
    assert.ok(existsSync(join(web, "..", "assets", "crear", "person", `${p.id}.png`)), `falta la fuente de ${p.id}`);
    assert.match(p.text, /piel /, p.id);
    assert.ok(p.relation.trim(), p.id);
  }
  // ni ids repetidos ni choques con las mascotas (la miniatura elegida se busca por el texto)
  const texts = [...PERSON_PICKS, ...PET_PICKS].map((p) => p.text);
  assert.equal(new Set(texts).size, texts.length);
});

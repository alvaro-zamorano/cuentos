/**
 * Ejemplos de «Quién más sale» (#54 y #98, 29 oct): uno de cada (abuelo, abuela, mamá, papá, hermana y bebé), con su
 * miniatura y su fuente en el repo, la piel en el texto, y una relación que cuenta como familia del padre. Y cómo se
 * eligen: la relación no se queda la de otro ejemplo y una mascota no hereda lo de una persona (revisión independiente).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PERSON_PICKS, PET_PICKS, pickCastExample, switchCastKind } from "../../lib/crearPicks";
import { familyIn } from "../../lib/plan/validate";

const web = join(__dirname, "..", "..");
const pick = (id: string) => [...PERSON_PICKS, ...PET_PICKS].find((p) => p.id === id)!;

test("los ejemplos de personas son uno de cada, con miniatura, fuente, la piel en el texto y una relación de familia", () => {
  assert.deepEqual(
    PERSON_PICKS.map((p) => p.label),
    ["Abuelo", "Abuela", "Mamá", "Papá", "Hermana", "Bebé"],
  );
  for (const p of PERSON_PICKS) {
    assert.ok(existsSync(join(web, "public", p.src)), `falta ${p.src}`);
    assert.ok(existsSync(join(web, "..", "assets", "crear", "person", `${p.id}.png`)), `falta la fuente de ${p.id}`);
    assert.match(p.text, /piel /, p.id);
    // si no cuenta como familia del padre, el validador del cuento puede darla por inventada
    assert.ok(familyIn(p.relation).size > 0, `${p.id}: «${p.relation}» no cuenta como familia`);
  }
  // ni ids ni textos repetidos, también con las mascotas (la miniatura elegida se busca por el texto)
  const all = [...PERSON_PICKS, ...PET_PICKS];
  assert.equal(new Set(all.map((p) => p.id)).size, all.length);
  assert.equal(new Set(all.map((p) => p.text)).size, all.length);
  // en las carpetas no sobra nada: el script de miniaturas convierte todo lo que haya
  const ids = PERSON_PICKS.map((p) => p.id).sort();
  assert.deepEqual(readdirSync(join(web, "public", "crear", "person")).map((f) => f.replace(/\.webp$/, "")).sort(), ids);
  assert.deepEqual(readdirSync(join(web, "..", "assets", "crear", "person")).map((f) => f.replace(/\.png$/, "")).sort(), ids);
});

test("elegir un ejemplo: la relación sigue al ejemplo, salvo la que escribió el padre; un segundo toque lo quita", () => {
  const empty = { kind: "persona", look: "", relation: "" };
  const abuela = pickCastExample(empty, pick("abuela"));
  assert.equal(abuela.relation, "su abuela");
  assert.match(abuela.look, /piel morena clara/);
  // de Abuela a Abuelo: antes se quedaba «su abuela»
  assert.equal(pickCastExample(abuela, pick("abuelo")).relation, "su abuelo");
  // la que escribió el padre no se toca
  assert.equal(pickCastExample({ ...empty, relation: "la yaya Pili" }, pick("abuela")).relation, "la yaya Pili");
  // segundo toque: fuera el texto y la relación que puso el ejemplo; la del padre se queda
  assert.deepEqual(pickCastExample(abuela, pick("abuela")), empty);
  assert.equal(pickCastExample({ ...abuela, relation: "la yaya Pili" }, pick("abuela")).relation, "la yaya Pili");
});

test("cambiar entre persona y mascota vacía lo que puso un ejemplo, no lo escrito a mano", () => {
  const abuela = pickCastExample({ kind: "persona", look: "", relation: "" }, pick("abuela"));
  assert.deepEqual(switchCastKind(abuela, "mascota"), { kind: "mascota", look: "", relation: "" });
  const corgi = pickCastExample(switchCastKind(abuela, "mascota"), pick(PET_PICKS[0].id));
  assert.equal(corgi.relation, PET_PICKS[0].relation);
  const own = { kind: "persona", look: "pelo blanco y bastón", relation: "la yaya Pili" };
  assert.deepEqual(switchCastKind(own, "mascota"), { ...own, kind: "mascota" });
  assert.equal(switchCastKind(own, "persona"), own);
});

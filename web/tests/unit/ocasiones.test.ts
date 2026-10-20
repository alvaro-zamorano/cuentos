/** Páginas de ocasión (lib/ocasiones.ts): contenido completo y sin textos que no queremos. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { OCASIONES, ocasionForStarter, ocasionPath } from "../../lib/ocasiones";
import { STARTERS } from "../../lib/plan/starters";

test("ocasiones: slugs únicos, idea de arranque que existe, portada en disco y contenido completo", () => {
  const slugs = new Set<string>();
  for (const o of OCASIONES) {
    assert.ok(/^[a-z0-9-]+$/.test(o.slug), o.slug);
    assert.ok(!slugs.has(o.slug), `repetido: ${o.slug}`);
    slugs.add(o.slug);
    assert.ok(STARTERS.some((s) => s.id === o.starter), `${o.slug}: idea ${o.starter}`);
    if (o.cover) assert.ok(existsSync(join(process.cwd(), "public", o.cover.src)), `${o.slug}: ${o.cover.src}`);
    assert.ok(o.ideas.length >= 3 && o.faq.length >= 3 && o.why.length >= 2, o.slug);
    assert.ok(o.description.length >= 120 && o.description.length <= 240, `${o.slug}: descripción de ${o.description.length}`);
    assert.ok(o.metaTitle.length <= 75, `${o.slug}: título de ${o.metaTitle.length}`);
  }
  assert.equal(ocasionPath("navidad"), "/cuento-personalizado/navidad");
  assert.equal(ocasionForStarter("reyes")?.slug, "navidad");
  assert.equal(ocasionForStarter("piratas"), null);
});

test("ocasiones: sin rayas, sin «AI» y sin diminutivos de tienda en el texto", () => {
  const text = JSON.stringify(OCASIONES);
  assert.ok(!/[—–]/.test(text), "rayas");
  assert.ok(!/\bAI\b/.test(text), "AI");
  assert.ok(!/(?<!\p{L})peques?(?!\p{L})/u.test(text), "peques");
});

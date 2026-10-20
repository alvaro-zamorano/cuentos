/** Salida con la app cerrada (20 oct): interruptor, qué rutas se cierran, botones y páginas de ocasión. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { appEnabled, gate, startCta, WAITLIST_PATH } from "../../lib/launch";
import { OCASIONES, ocasionForStarter, ocasionPath } from "../../lib/ocasiones";
import { STARTERS } from "../../lib/plan/starters";

test("appEnabled: cerrada en producción sin variable; abierta en preview y local; la variable manda", () => {
  assert.equal(appEnabled({ VERCEL_ENV: "production" }), false);
  assert.equal(appEnabled({ VERCEL_ENV: "preview" }), true);
  assert.equal(appEnabled({}), true);
  assert.equal(appEnabled({ VERCEL_ENV: "production", APP_ENABLED: "1" }), true);
  assert.equal(appEnabled({ VERCEL_ENV: "preview", APP_ENABLED: "0" }), false);
  // un valor raro no abre producción
  assert.equal(appEnabled({ VERCEL_ENV: "production", APP_ENABLED: "true" }), false);
});

test("gate: con la app cerrada, /crear a la lista y las API que gastan a 503; lo demás pasa", () => {
  assert.deepEqual(gate("/crear", false), { kind: "page" });
  assert.deepEqual(gate("/crear/algo", false), { kind: "page" });
  for (const p of ["/api/plan", "/api/plan/page", "/api/libro/start", "/api/generate/run", "/api/dev", "/api/lead", "/api/pdf"]) assert.deepEqual(gate(p, false), { kind: "api" }, p);
  for (const p of ["/", "/api/health", "/api/cron/purge", "/api/cron/print", "/api/mail/inbound", "/api/stripe/webhook", "/api/print/webhook", "/api/lista", WAITLIST_PATH, "/cuento-personalizado/navidad", "/crearx"])
    assert.equal(gate(p, false), null, p);
});

test("gate: con la app abierta todo pasa y la lista de espera lleva a /crear", () => {
  assert.equal(gate("/crear", true), null);
  assert.equal(gate("/api/libro/start", true), null);
  assert.deepEqual(gate(WAITLIST_PATH, true), { kind: "waitlist-open" });
});

test("startCta: /crear con la idea o la lista de espera con la idea", () => {
  assert.deepEqual(startCta(true), { href: "/crear", closed: false });
  assert.deepEqual(startCta(true, "navidad"), { href: "/crear?idea=navidad", closed: false });
  assert.deepEqual(startCta(false, "cole"), { href: `${WAITLIST_PATH}?idea=cole`, closed: true });
});

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

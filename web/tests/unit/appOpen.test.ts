/** La app cerrada en producción hasta que se abra (lib/appOpen.ts): qué sigue vivo y qué no. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { LEGACY_API, appOpen, closedAction, openAction } from "../../lib/appOpen";
import { sitemapPaths } from "../../lib/site";

/** Rutas de app/api tal como se piden («[id]» pasa a «x»). */
function apiRoutes(): string[] {
  const root = join(__dirname, "../../app");
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "route.ts") out.push(`/${relative(root, dir).split(sep).join("/")}`.replace(/\[[^\]]+\]/g, "x"));
    }
  };
  walk(join(root, "api"));
  return out.sort();
}

const isLegacy = (p: string) => LEGACY_API.some((l) => p === l || p.startsWith(`${l}/`));

test("openAction (26 oct, B5): con la app abierta, la API del flujo antiguo da 404 y la del nuevo pasa", () => {
  for (const p of ["/api/generate/sample", "/api/generate/book", "/api/generate/status", "/api/books", "/api/books/abc123", "/api/jobs", "/api/story", "/api/lead", "/api/pdf", "/api/inventada"]) {
    assert.deepEqual(openAction(p), { type: "not_found" }, p);
  }
  for (const p of ["/api/plan", "/api/plan/page", "/api/libro/start", "/api/libro/view", "/api/libro/pdf", "/api/generate/run", "/api/dev", "/api/health", "/api/cron/purge", "/api/mail/inbound", "/api/stripe/webhook", "/api/print/webhook"]) {
    assert.deepEqual(openAction(p), { type: "pass" }, p);
  }
  for (const p of ["/", "/crear", "/crear/algo", "/privacidad", "/apiario"]) assert.deepEqual(openAction(p), { type: "pass" }, p);
});

test("cada ruta de app/api está clasificada: o la usa el flujo nuevo, o es del antiguo y da 404", () => {
  const routes = apiRoutes();
  assert.ok(routes.length >= 30, `rutas encontradas: ${routes.length}`);
  for (const r of routes) {
    const passes = openAction(r).type === "pass";
    assert.notEqual(passes, isLegacy(r), `${r}: ${passes ? "pasa y está en LEGACY_API" : "da 404 y no está en LEGACY_API (¿falta en APP_API?)"}`);
  }
});

test("appOpen: cerrada en producción sin APP_OPEN; abierta en la preview y en local; APP_OPEN manda", () => {
  assert.equal(appOpen({ VERCEL_ENV: "production" }), false);
  assert.equal(appOpen({ VERCEL_ENV: "production", APP_OPEN: "1" }), true);
  assert.equal(appOpen({ VERCEL_ENV: "preview" }), true);
  assert.equal(appOpen({}), true);
  assert.equal(appOpen({ APP_OPEN: "0" }), false, "para probar el cierre en local");
  assert.equal(appOpen({ VERCEL_ENV: "production", APP_OPEN: " 1 " }), true);
  assert.equal(appOpen({ VERCEL_ENV: "production", APP_OPEN: "si" }), false, "solo 1 abre");
});

test("closedAction: /crear a la landing; la API que gasta, 404; crons, correo, webhooks y salud siguen", () => {
  assert.deepEqual(closedAction("/crear"), { type: "redirect", to: "/#pronto" });
  assert.deepEqual(closedAction("/crear/algo"), { type: "redirect", to: "/#pronto" });
  for (const p of ["/api/plan", "/api/plan/page", "/api/libro/start", "/api/libro/checkout", "/api/generate/run", "/api/lead", "/api/pdf", "/api/dev", "/api/healthz", "/api/stripe/webhookx"]) {
    assert.deepEqual(closedAction(p), { type: "not_found" }, p);
  }
  for (const p of ["/api/health", "/api/cron/purge", "/api/cron/print", "/api/mail/inbound", "/api/stripe/webhook", "/api/print/webhook"]) {
    assert.deepEqual(closedAction(p), { type: "pass" }, p);
  }
  for (const p of ["/", "/privacidad", "/condiciones", "/aviso-legal", "/crearx", "/muestra/luna-01.webp"]) {
    assert.deepEqual(closedAction(p), { type: "pass" }, p);
  }
});

test("sitemapPaths: sin /crear mientras esté cerrada", () => {
  assert.deepEqual(sitemapPaths(false), ["/", "/privacidad", "/condiciones", "/aviso-legal"]);
  assert.ok(sitemapPaths(true).includes("/crear"));
});

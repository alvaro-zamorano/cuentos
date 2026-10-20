/** La app cerrada en producción hasta que se abra (lib/appOpen.ts): qué sigue vivo y qué no. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { appOpen, closedAction } from "../../lib/appOpen";
import { sitemapPaths } from "../../lib/site";

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

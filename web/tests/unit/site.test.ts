/** robots y sitemap (lib/site.ts): solo producción con dominio propio se deja indexar. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexable, siteUrl } from "../../lib/site";

test("siteUrl: https sin barra final; lo demás no vale", () => {
  assert.equal(siteUrl({ SITE_URL: "https://ejemplo.es/" }), "https://ejemplo.es");
  assert.equal(siteUrl({ SITE_URL: "http://ejemplo.es" }), null);
  assert.equal(siteUrl({ SITE_URL: "https://ejemplo.es/ruta" }), null);
  assert.equal(siteUrl({}), null);
});

test("indexable: solo producción con SITE_URL", () => {
  assert.equal(indexable({ VERCEL_ENV: "production", SITE_URL: "https://ejemplo.es" }), true);
  assert.equal(indexable({ VERCEL_ENV: "production" }), false);
  assert.equal(indexable({ VERCEL_ENV: "preview", SITE_URL: "https://ejemplo.es" }), false);
  assert.equal(indexable({ SITE_URL: "https://ejemplo.es" }), false);
});

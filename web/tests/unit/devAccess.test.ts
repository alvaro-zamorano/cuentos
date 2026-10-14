/** /api/dev: cerrado en producción, cerrado en las previews sin DEV_TOKEN, abierto en local. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { devAccessAllowed, devTokenFrom } from "../../lib/devAccess";

test("producción: nunca, ni con el token bueno", () => {
  assert.equal(devAccessAllowed({ VERCEL_ENV: "production", DEV_TOKEN: "abc" }, "abc"), false);
});

test("preview sin DEV_TOKEN: cerrado", () => {
  assert.equal(devAccessAllowed({ VERCEL_ENV: "preview" }, null), false);
  assert.equal(devAccessAllowed({ VERCEL_ENV: "preview" }, "cualquiera"), false);
  assert.equal(devAccessAllowed({ VERCEL_ENV: "preview", DEV_TOKEN: "  " }, ""), false);
});

test("preview con DEV_TOKEN: solo con el mismo valor", () => {
  const env = { VERCEL_ENV: "preview", DEV_TOKEN: "secreto-largo" };
  assert.equal(devAccessAllowed(env, "secreto-largo"), true);
  assert.equal(devAccessAllowed(env, "secreto-larg"), false);
  assert.equal(devAccessAllowed(env, "otro-valor-xx"), false);
  assert.equal(devAccessAllowed(env, null), false);
});

test("local (sin VERCEL_ENV): abierto", () => {
  assert.equal(devAccessAllowed({}, null), true);
});

test("el token sale de la cabecera o de ?token=", () => {
  assert.equal(devTokenFrom(new Request("https://x.test/api/dev?task=view", { headers: { "x-dev-token": "h" } })), "h");
  assert.equal(devTokenFrom(new Request("https://x.test/api/dev?task=view&token=q")), "q");
  assert.equal(devTokenFrom(new Request("https://x.test/api/dev?task=view")), null);
});

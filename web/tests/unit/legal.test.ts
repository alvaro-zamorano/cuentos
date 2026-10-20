/** Datos del titular desde variables de entorno (lib/legal.ts): limpios, acotados y sin valores vacíos. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { titular, titularComplete } from "../../lib/legal";

test("titular: lee las cuatro variables y limpia espacios", () => {
  const t = titular({ LEGAL_NAME: "  Ana  Pérez ", LEGAL_NIF: "00000000T", LEGAL_ADDRESS: "Calle\nMayor 1, Madrid", LEGAL_EMAIL: "hola@ejemplo.es" });
  assert.deepEqual(t, { name: "Ana Pérez", nif: "00000000T", address: "Calle Mayor 1, Madrid", email: "hola@ejemplo.es" });
  assert.equal(titularComplete(t), true);
});

test("titular: sin variables o con blancos, huecos (y no se puede abrir al público)", () => {
  const t = titular({ LEGAL_NAME: "   ", LEGAL_EMAIL: "hola@ejemplo.es" });
  assert.equal(t.name, undefined);
  assert.equal(t.nif, undefined);
  assert.equal(titularComplete(t), false);
  assert.equal(titularComplete(titular({})), false);
});

test("titularLine: sin datos, la marca; con ellos, nombre, NIF y domicilio", async () => {
  const { titularLine } = await import("../../lib/legal");
  assert.equal(titularLine(titular({})), "Érase su vez");
  assert.equal(titularLine(titular({ LEGAL_NAME: "Ana Pérez", LEGAL_NIF: "00000000T", LEGAL_ADDRESS: "Calle Mayor 1, Madrid" })), "Ana Pérez, NIF 00000000T, domicilio Calle Mayor 1, Madrid");
  assert.equal(titularLine(titular({ LEGAL_NAME: "Ana Pérez" })), "Ana Pérez");
});

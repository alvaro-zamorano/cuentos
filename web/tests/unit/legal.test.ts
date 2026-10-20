/** Datos del titular desde variables de entorno (lib/legal.ts): limpios, acotados y sin valores vacíos. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { holderLine, titular, titularComplete } from "../../lib/legal";

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

test("holderLine: sin nombre, NIF ni domicilio, el nombre comercial (decisión del 20 oct); con ellos, los tres", () => {
  assert.equal(holderLine(titular({ LEGAL_EMAIL: "hola@ejemplo.es" })), "Érase su vez");
  assert.equal(holderLine(titular({ LEGAL_NAME: "Ana Pérez", LEGAL_NIF: "00000000T", LEGAL_ADDRESS: "Calle Mayor 1" })), "Ana Pérez, NIF 00000000T, domicilio en Calle Mayor 1");
});

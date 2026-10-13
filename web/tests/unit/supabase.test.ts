import { test } from "node:test";
import assert from "node:assert/strict";
import { keyKind } from "../../lib/supabase/admin";

// Claves de juguete: mismo formato que las de Supabase, sin valor real.
const jwt = (payload: object) => ["e30", Buffer.from(JSON.stringify(payload)).toString("base64url"), "firma"].join(".");

test("keyKind distingue la clave de servicio de la pública sin exponerla", () => {
  assert.equal(keyKind(undefined), null);
  assert.equal(keyKind("sb_secret_xxx"), "secret");
  assert.equal(keyKind("sb_publishable_xxx"), "publishable");
  assert.equal(keyKind(jwt({ role: "service_role" })), "jwt:service_role");
  assert.equal(keyKind(jwt({ role: "anon" })), "jwt:anon");
  assert.equal(keyKind(jwt({})), "jwt");
  assert.equal(keyKind("a.%%%.c"), "unknown");
  assert.equal(keyKind("otra-cosa"), "unknown");
});

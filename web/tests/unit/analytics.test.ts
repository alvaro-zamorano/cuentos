/** Analítica (lib/analytics.ts): el enlace del libro nunca sale y en /crear no hay clics automáticos. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CaptureResult } from "posthog-js";
import { beforeSend, posthogKeyOk, scrubUrl, track } from "../../lib/analytics";

test("scrubUrl: enmascara b en URL absolutas y relativas y deja el resto igual", () => {
  assert.equal(scrubUrl("https://erasesuvez.es/crear?b=abc12345&pagado=1"), "https://erasesuvez.es/crear?b=%3CMASKED%3E&pagado=1");
  assert.equal(scrubUrl("/crear?b=abc12345"), "/crear?b=%3CMASKED%3E");
  assert.equal(scrubUrl("https://erasesuvez.es/crear?idea=cumple"), "https://erasesuvez.es/crear?idea=cumple");
  assert.equal(scrubUrl("https://erasesuvez.es/"), "https://erasesuvez.es/");
  assert.equal(scrubUrl(42), 42);
  assert.ok(!String(scrubUrl("https://x.es/crear?b=abc12345")).includes("abc12345"));
});

const ev = (event: string, properties: Record<string, unknown>, extra: Partial<CaptureResult> = {}) =>
  ({ uuid: "u", event, properties, ...extra }) as CaptureResult;

test("beforeSend: sin clics automáticos en /crear; sí en el resto", () => {
  assert.equal(beforeSend(ev("$autocapture", { $pathname: "/crear" })), null);
  assert.equal(beforeSend(ev("$autocapture", { $pathname: "/crear/x" })), null);
  assert.notEqual(beforeSend(ev("$autocapture", { $pathname: "/" })), null);
  assert.notEqual(beforeSend(ev("crear_paso", { $pathname: "/crear", paso: 2 })), null, "los eventos propios sí salen");
});

test("beforeSend: quita b de las URL del evento y de $set_once", () => {
  const out = beforeSend(
    ev(
      "$pageview",
      { $pathname: "/crear", $current_url: "https://erasesuvez.es/crear?b=secreto123", $referrer: "https://erasesuvez.es/crear?b=secreto123" },
      { $set_once: { $initial_current_url: "https://erasesuvez.es/crear?b=secreto123" } },
    ),
  );
  assert.ok(out);
  assert.ok(!JSON.stringify(out).includes("secreto123"));
});

test("posthogKeyOk: solo identificadores de proyecto", () => {
  assert.equal(posthogKeyOk(undefined), false);
  assert.equal(posthogKeyOk(""), false);
  assert.equal(posthogKeyOk("phx_personal_api_key_que_no_va_aqui"), false, "una clave personal no es un identificador de proyecto");
  assert.equal(posthogKeyOk("phc_" + "a".repeat(43)), true);
});

test("track: sin navegador ni consentimiento no hace nada", () => {
  assert.doesNotThrow(() => track({ name: "crear_paso", props: { paso: 1 } }));
});

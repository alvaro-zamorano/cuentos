/** Analítica (lib/analytics.ts): el enlace del libro nunca sale y en /crear no hay clics automáticos. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CaptureResult } from "posthog-js";
import { beforeSend, CONSENT_MAX_AGE_MS, parseConsent, posthogKeyOk, scrubUrl, track } from "../../lib/analytics";

test("scrubUrl: enmascara b en URL absolutas y relativas y deja el resto igual", () => {
  assert.equal(scrubUrl("https://erasesuvez.es/crear?b=abc12345&pagado=1"), "https://erasesuvez.es/crear?b=%3CMASKED%3E&pagado=1");
  assert.equal(scrubUrl("/crear?b=abc12345"), "/crear?b=%3CMASKED%3E");
  assert.equal(scrubUrl("https://erasesuvez.es/crear?idea=cumple"), "https://erasesuvez.es/crear?idea=cumple");
  assert.equal(scrubUrl("https://erasesuvez.es/"), "https://erasesuvez.es/");
  assert.equal(scrubUrl(42), 42);
  assert.ok(!String(scrubUrl("https://x.es/crear?b=abc12345")).includes("abc12345"));
  // la llave de baja de las novedades tampoco sale
  assert.equal(scrubUrl("/baja?t=0b8f6c1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b"), "/baja?t=%3CMASKED%3E");
  assert.ok(!String(scrubUrl("https://erasesuvez.es/baja?t=0b8f6c1e-1d2a-4c3b-9a8b-7c6d5e4f3a2b")).includes("0b8f6c1e"));
});

const ev = (event: string, properties: Record<string, unknown>, extra: Partial<CaptureResult> = {}) =>
  ({ uuid: "u", event, properties, ...extra }) as CaptureResult;

test("beforeSend: ningún evento de clic en ningún sitio (25 oct); los propios y las páginas vistas sí", () => {
  for (const name of ["$autocapture", "$rageclick", "$dead_click", "$$heatmap"]) {
    assert.equal(beforeSend(ev(name, { $pathname: "/crear" })), null, name);
    assert.equal(beforeSend(ev(name, { $pathname: "/" })), null, name);
  }
  // cualquier evento que traiga elementos de la página (texto del botón, enlaces con el b del libro), fuera
  const conTexto = { $pathname: "/crear", $el_text: "Dibujar a Lucía", $elements_chain: 'a:attr__href="/api/libro/pdf?b=abc12345"' };
  assert.equal(beforeSend(ev("$algo_nuevo", conTexto)), null);
  assert.notEqual(beforeSend(ev("crear_paso", { $pathname: "/crear", paso: 2 })), null, "los eventos propios sí salen");
  assert.notEqual(beforeSend(ev("$pageview", { $pathname: "/" })), null, "las páginas vistas sí salen");
});

test("consentimiento: se guarda con fecha y caduca a los 24 meses", () => {
  const now = Date.parse("2026-10-25T10:00:00Z");
  assert.equal(parseConsent("accepted|2026-10-25T09:00:00.000Z", now), "accepted");
  assert.equal(parseConsent("rejected|2026-10-01T09:00:00.000Z", now), "rejected");
  assert.equal(parseConsent(`accepted|${new Date(now - CONSENT_MAX_AGE_MS - 1000).toISOString()}`, now), null, "caducado: se vuelve a preguntar");
  assert.equal(parseConsent("accepted", now), null, "el formato viejo, sin fecha (el de Clarity), no vale");
  assert.equal(parseConsent(null, now), null);
  assert.equal(parseConsent("quizá|2026-10-25T09:00:00.000Z", now), null);
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

test("I22: ni el b del libro ni el id del pedido salen en ninguna propiedad de URL, referrer o ruta", () => {
  const props = {
    $current_url: "https://www.erasesuvez.com/seguimiento/9f3c2a77-1111-4222-8333-944455556666",
    $pathname: "/seguimiento/9f3c2a77-1111-4222-8333-944455556666",
    $session_entry_url: "https://www.erasesuvez.com/seguimiento/9f3c2a77-1111-4222-8333-944455556666?utm=mail",
    $session_entry_referrer: "https://www.erasesuvez.com/crear?b=abc12345",
    $session_entry_pathname: "/crear",
    $prev_pageview_pathname: "/seguimiento/9f3c2a77-1111-4222-8333-944455556666",
    $referring_domain: "www.erasesuvez.com",
    paso: 5,
  };
  const out = beforeSend(ev("$pageview", { ...props }, { $set_once: { $initial_referrer: "https://www.erasesuvez.com/crear?b=abc12345&pagado=1" } }))!;
  const all = JSON.stringify(out);
  assert.ok(!all.includes("9f3c2a77") && !all.includes("abc12345"), all);
  assert.equal(out.properties.$pathname, "/seguimiento/:id");
  assert.equal(out.properties.$current_url, "https://www.erasesuvez.com/seguimiento/:id");
  assert.equal(out.properties.$session_entry_url, "https://www.erasesuvez.com/seguimiento/:id?utm=mail");
  assert.equal(out.properties.$session_entry_pathname, "/crear");
  assert.equal(out.properties.paso, 5);
  assert.equal(scrubUrl("/seguimiento/abc"), "/seguimiento/:id");
});

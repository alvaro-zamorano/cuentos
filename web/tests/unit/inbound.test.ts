/**
 * Correo entrante: firma de Svix (con el vector de prueba oficial), el correo que se reenvía y el recorrido con un doble
 * de la API de Resend. Sin red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { forwardPlan, forwardTargets, handleInbound, inboundEnabled, parseAddress, verifySvix, type ReceivedEmail } from "../../lib/inbound";

const SECRET = "whsec_plJ3nmyCDGBKInavdOK15jsl";
const ENV = { RESEND_API_KEY: "re_prueba", RESEND_WEBHOOK_SECRET: SECRET, MAIL_FROM: "Érase su vez <hola@erasesuvez.com>", MAIL_FORWARD_TO: "dueno@gmail.com" };

function sign(payload: string, id: string, ts: number, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64")}`;
}

test("firma de Svix: vector oficial, otra clave, cuerpo tocado, fuera de tiempo y varias firmas", () => {
  // vector de docs.svix.com (verificación manual)
  const payload = '{"event_type":"ping","data":{"success":true}}';
  const h = { id: "msg_loFOjxBNrRLzqYUf", timestamp: "1731705121", signature: "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=" };
  const at = 1731705121 * 1000;
  assert.equal(verifySvix(payload, h, SECRET, at), true);
  assert.equal(verifySvix(payload, h, "whsec_" + Buffer.from("otra clave").toString("base64"), at), false);
  assert.equal(verifySvix(payload.replace("true", "false"), h, SECRET, at), false);
  assert.equal(verifySvix(payload, h, SECRET, at + 301_000), false, "más de 5 minutos");
  assert.equal(verifySvix(payload, { ...h, signature: `v1,AAAA ${h.signature}` }, SECRET, at), true, "una de varias");
  assert.equal(verifySvix(payload, { ...h, signature: null }, SECRET, at), false);
  assert.equal(verifySvix(payload, { ...h, signature: h.signature.replace("v1,", "v2,") }, SECRET, at), false);
});

test("direcciones y configuración", () => {
  assert.deepEqual(parseAddress("Ana García <Ana@X.com>"), { name: "Ana García", address: "ana@x.com" });
  assert.deepEqual(parseAddress('"Pérez, Luis" <luis@y.es>'), { name: "Pérez, Luis", address: "luis@y.es" });
  assert.deepEqual(parseAddress("solo@z.org"), { name: "", address: "solo@z.org" });
  assert.deepEqual(forwardTargets({ MAIL_FORWARD_TO: " a@b.com, mal, c@d.es " }), ["a@b.com", "c@d.es"]);
  assert.equal(inboundEnabled(ENV), true);
  assert.equal(inboundEnabled({ ...ENV, MAIL_FORWARD_TO: "" }), false);
  assert.equal(inboundEnabled({ ...ENV, RESEND_WEBHOOK_SECRET: undefined }), false);
});

const EMAIL: ReceivedEmail = {
  id: "56761188-7520-42d8-8898-ff6fc54ce618",
  from: "Ana García <ana@gmail.com>",
  to: ["hola@erasesuvez.com"],
  subject: "Duda con mi pedido",
  html: "<p>Hola, <b>¿cuándo</b> llega?</p>",
  text: "Hola, ¿cuándo llega?",
  reply_to: [],
  authentication: { spf: "pass", dkim: "pass", dmarc: "pass" },
  attachments: [{ id: "a1", filename: "foto.jpg", content_type: "image/jpeg", content_disposition: "attachment", content_id: null }],
};

test("el correo reenviado: remitente visible, responder a quien escribió, adjuntos por enlace", () => {
  const plan = forwardPlan(EMAIL, [{ id: "a1", filename: "foto.jpg", content_type: "image/jpeg", download_url: "https://resend.example/a1?sig=x", content_id: "<img1>" }], ENV);
  assert.ok("body" in plan);
  const b = plan.body;
  assert.equal(b.from, '"Ana García (vía Érase su vez)" <hola@erasesuvez.com>');
  assert.deepEqual(b.to, ["dueno@gmail.com"]);
  assert.deepEqual(b.reply_to, ["ana@gmail.com"]);
  assert.equal(b.subject, "Duda con mi pedido");
  assert.match(String(b.text), /^De: Ana García <ana@gmail.com>\nPara: hola@erasesuvez.com\n\nHola, ¿cuándo llega\?/);
  assert.match(String(b.html), /De: Ana García &lt;ana@gmail.com&gt;/);
  assert.match(String(b.html), /<b>¿cuándo<\/b>/, "el HTML original va tal cual");
  assert.deepEqual(b.attachments, [{ filename: "foto.jpg", path: "https://resend.example/a1?sig=x", content_type: "image/jpeg", content_id: "img1" }]);

  // si el remitente pidió otra dirección de respuesta, se respeta
  const r = forwardPlan({ ...EMAIL, reply_to: ["otra@ana.com"], subject: "" }, [], ENV);
  assert.ok("body" in r && (r.body.reply_to as string[])[0] === "otra@ana.com" && r.body.subject === "(sin asunto)" && !("attachments" in r.body));
  // nombres con comillas o saltos de línea no rompen la cabecera
  const evil = forwardPlan({ ...EMAIL, from: '"Mal\r\nBcc: x@y.z" <mal@x.com>' }, [], ENV);
  assert.ok("body" in evil && !/[\r\n]/.test(String(evil.body.from)));
});

test("no se reenvía: DMARC fallido, bucles y sin configurar", () => {
  assert.deepEqual(forwardPlan({ ...EMAIL, authentication: { dmarc: "fail" } }, [], ENV), { skip: "dmarc_fail" });
  assert.deepEqual(forwardPlan({ ...EMAIL, from: "Érase su vez <hola@erasesuvez.com>" }, [], ENV), { skip: "loop" });
  assert.deepEqual(forwardPlan(EMAIL, [], { ...ENV, MAIL_FORWARD_TO: "otro@erasesuvez.com" }), { skip: "loop" });
  assert.deepEqual(forwardPlan(EMAIL, [], { ...ENV, MAIL_FORWARD_TO: "" }), { skip: "sin_configurar" });
});

type Call = { url: string; method: string; headers: Record<string, string>; body?: Record<string, unknown> };

function fakeResend(sendStatuses: number[]) {
  const calls: Call[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const call: Call = { url, method: init?.method ?? "GET", headers, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(call);
    if (url.endsWith("/attachments")) return Response.json({ object: "list", data: [{ id: "a1", filename: "foto.jpg", content_type: "image/jpeg", download_url: "https://resend.example/a1" }] });
    if (url.includes("/emails/receiving/")) return Response.json(EMAIL);
    if (url.endsWith("/emails")) return new Response("{}", { status: sendStatuses.shift() ?? 200 });
    return new Response("no", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}

const received = { type: "email.received", data: { email_id: EMAIL.id } };

test("recorrido: lee el correo y sus adjuntos y lo reenvía una vez", async () => {
  const { f, calls } = fakeResend([200]);
  assert.deepEqual(await handleInbound(received, ENV, f), { action: "forwarded" });
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url.replace("https://api.resend.com", "")}`), [
    `GET /emails/receiving/${EMAIL.id}?html_format=cid`,
    `GET /emails/receiving/${EMAIL.id}/attachments`,
    "POST /emails",
  ]);
  assert.equal(calls[0].headers.authorization, "Bearer re_prueba");
  assert.equal(calls[2].headers["idempotency-key"], `inbound-${EMAIL.id}`, "Resend no lo manda dos veces aunque repita el webhook");
  assert.equal((calls[2].body?.attachments as unknown[]).length, 1);
});

test("recorrido: otros eventos, repetidos, adjunto rechazado y errores", async () => {
  assert.deepEqual(await handleInbound({ type: "email.sent", data: {} }, ENV, fakeResend([]).f), { action: "ignored", reason: "email.sent" });
  assert.deepEqual(await handleInbound({ type: "email.received", data: { email_id: "../x" } }, ENV, fakeResend([]).f), { action: "ignored", reason: "sin_id" });

  // ya reenviado (misma clave, enlaces de adjuntos nuevos): 409 y no se manda otra vez
  const dup = fakeResend([409]);
  assert.deepEqual(await handleInbound(received, ENV, dup.f), { action: "forwarded", reason: "duplicado" });
  assert.equal(dup.calls.filter((c) => c.method === "POST").length, 1);

  // adjunto no permitido: se reenvía sin adjuntos y con una nota
  const bad = fakeResend([422, 200]);
  assert.deepEqual(await handleInbound(received, ENV, bad.f), { action: "forwarded", reason: "sin_adjuntos" });
  const retry = bad.calls.filter((c) => c.method === "POST")[1];
  assert.equal(retry.body?.attachments, undefined);
  assert.match(String(retry.body?.text), /1 adjunto\(s\) no se han podido reenviar/);
  assert.equal(retry.headers["idempotency-key"], `inbound-${EMAIL.id}-sin-adjuntos`);

  // Resend caído: error, y el webhook responde 500 para que lo reintente
  assert.deepEqual(await handleInbound(received, ENV, fakeResend([503]).f), { action: "error", reason: "enviar_503" });
  assert.deepEqual(await handleInbound(received, { ...ENV, RESEND_API_KEY: "" }, fakeResend([]).f), { action: "error", reason: "sin_clave" });
});

test("firma del webhook de punta a punta con una marca de tiempo actual", () => {
  const payload = JSON.stringify(received);
  const ts = Math.floor(Date.now() / 1000);
  assert.equal(verifySvix(payload, { id: "msg_1", timestamp: String(ts), signature: sign(payload, "msg_1", ts) }, SECRET), true);
  assert.equal(verifySvix(payload, { id: "msg_2", timestamp: String(ts), signature: sign(payload, "msg_1", ts) }, SECRET), false, "el id también va firmado");
});

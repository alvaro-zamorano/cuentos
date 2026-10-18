/**
 * B5: pago con Stripe (firma del webhook, cuerpo del checkout, pedido idempotente), pintar en segundo plano y el email
 * de «tu libro está listo» (una vez). Sin red: Stripe y Resend no se llaman.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll, publicOrigin } from "../../lib/book/background";
import { bookView, prepareCheckout, notifyBookReady, payDryRun, pendingPageJobs, recordStripePayment, requestPages, startBook, PRICE_CENTS } from "../../lib/book/service";
import { checkoutBody, dryRunPaymentAllowed, paymentMode, verifyWebhook, waiverAccepted, WAIVER_VERSION } from "../../lib/stripe";
import { mailEnabled } from "../../lib/mail";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const email = "vera@example.com";
const SECRET = "whsec_prueba_unitaria";

function sign(payload: string, t: number, secret = SECRET): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
}

async function newBook() {
  const store = memoryStore(newMemoryState());
  const start = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  return { store, start: start as Extract<typeof start, { ok: true }> };
}

test("verifyWebhook: acepta la firma buena y rechaza secreto, payload o fecha distintos", () => {
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed", data: { object: {} } });
  const now = 1_760_000_000_000;
  const t = Math.floor(now / 1000);
  assert.equal(verifyWebhook(payload, sign(payload, t), SECRET, now)?.id, "evt_1");
  // varias firmas v1 (rotación del secreto): basta una
  assert.ok(verifyWebhook(payload, `${sign(payload, t, "otro")},v1=${sign(payload, t).split("v1=")[1]}`, SECRET, now));
  assert.equal(verifyWebhook(payload, sign(payload, t, "otro"), SECRET, now), null, "otro secreto");
  assert.equal(verifyWebhook(payload + " ", sign(payload, t), SECRET, now), null, "payload tocado");
  assert.equal(verifyWebhook(payload, sign(payload, t - 301), SECRET, now), null, "más de 5 min");
  assert.equal(verifyWebhook(payload, null, SECRET, now), null);
  assert.equal(verifyWebhook(payload, "t=abc,v1=00", SECRET, now), null);
  assert.equal(verifyWebhook(payload, sign(payload, t), "", now), null, "sin secreto no se acepta nada");
});

test("checkoutBody: pago único en euros con el libro en metadata y la vuelta a /crear", () => {
  const p = checkoutBody({ bookId: "abc12345", email: "a@b.es", title: "Vera y Toby viajan a la Luna", amountCents: 1490, origin: "https://cuentos.example" });
  assert.equal(p.get("mode"), "payment");
  assert.equal(p.get("line_items[0][price_data][currency]"), "eur");
  assert.equal(p.get("line_items[0][price_data][unit_amount]"), "1490");
  assert.equal(p.get("metadata[bookId]"), "abc12345");
  assert.equal(p.get("client_reference_id"), "abc12345");
  assert.equal(p.get("customer_email"), "a@b.es");
  assert.equal(p.get("success_url"), "https://cuentos.example/crear?b=abc12345&pagado=1");
  assert.equal(p.get("cancel_url"), "https://cuentos.example/crear?b=abc12345");
  assert.match(p.get("line_items[0][price_data][product_data][name]")!, /Vera y Toby/);
  assert.equal(checkoutBody({ bookId: "abc12345", email: null, title: "x", amountCents: 1, origin: "o" }).has("customer_email"), false);
});

test("renuncia al desistimiento: solo con waiver === true, y queda en los metadatos de la sesión y del cobro", () => {
  assert.equal(waiverAccepted({ bookId: "x", waiver: true }), true);
  for (const b of [null, undefined, {}, { waiver: "true" }, { waiver: 1 }, { waiver: false }]) assert.equal(waiverAccepted(b as Record<string, unknown> | null), false);
  const at = "2026-10-16T10:00:00.000Z";
  const p = checkoutBody({ bookId: "abc12345", email: null, title: "x", amountCents: 1490, origin: "o", waiverAt: at });
  assert.equal(p.get("metadata[withdrawal_waiver_at]"), at);
  assert.equal(p.get("payment_intent_data[metadata][withdrawal_waiver_at]"), at);
  assert.equal(p.get("metadata[withdrawal_waiver_version]"), WAIVER_VERSION);
  assert.equal(checkoutBody({ bookId: "abc12345", email: null, title: "x", amountCents: 1490, origin: "o" }).has("metadata[withdrawal_waiver_at]"), false);
});

test("paymentMode: Stripe con sus dos claves; el pago de prueba nunca en producción", () => {
  assert.equal(paymentMode({}), "none");
  assert.equal(paymentMode({ NEXT_PUBLIC_DRY_RUN_PAYMENT: "1" }), "dry-run");
  assert.equal(paymentMode({ NEXT_PUBLIC_DRY_RUN_PAYMENT: "1", VERCEL_ENV: "production" }), "none");
  assert.equal(dryRunPaymentAllowed({ NEXT_PUBLIC_DRY_RUN_PAYMENT: "1", VERCEL_ENV: "preview" }), true);
  assert.equal(paymentMode({ STRIPE_SECRET_KEY: "sk_test_x" }), "none", "sin el secreto del webhook no se cobra");
  assert.equal(paymentMode({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x", NEXT_PUBLIC_DRY_RUN_PAYMENT: "1" }), "stripe");
  assert.equal(mailEnabled({ RESEND_API_KEY: "re_x" }), false, "sin remitente no se manda");
  assert.equal(mailEnabled({ RESEND_API_KEY: "re_x", MAIL_FROM: "Cuentos <hola@x.es>" }), true);
});

test("publicOrigin: SITE_URL manda; si no, las cabeceras de la petición", () => {
  const req = new Request("http://interno/api", { headers: { "x-forwarded-host": "preview.vercel.app", "x-forwarded-proto": "https" } });
  const prev = process.env.SITE_URL;
  delete process.env.SITE_URL;
  assert.equal(publicOrigin(req), "https://preview.vercel.app");
  process.env.SITE_URL = "https://cuentos.example/";
  assert.equal(publicOrigin(req), "https://cuentos.example");
  if (prev === undefined) delete process.env.SITE_URL;
  else process.env.SITE_URL = prev;
});

test("paintAll: hoja y portada se terminan en segundo plano (una detrás de otra)", async () => {
  const { store, start } = await newBook();
  const out = await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  assert.deepEqual(out, { [start.sheetJobId]: "done", [start.coverJobId]: "done" });
  assert.equal(start.fresh, true, "primera hoja: se manda el enlace");
  const again = await startBook(store, { bookId: start.bookId, email, ficha, plan }, dryRunAdapter, MOCK_LLM);
  assert.ok(again.ok && !again.fresh, "repetir el paso 4 no vuelve a mandar el enlace");
  // sin tiempo no se empieza nada
  const late = await paintAll(store, dryRunAdapter, [start.sheetJobId], { deadline: Date.now() - 1 });
  assert.deepEqual(late, { [start.sheetJobId]: "timeout" });
});

test("webhook: el pedido se registra una vez; lo que no es un cobro se ignora", async () => {
  const { store, start } = await newBook();
  const ev = (type: string, object: Record<string, unknown>) => ({ type, data: { object } });
  const paid = { id: "cs_test_1", payment_status: "paid", amount_total: PRICE_CENTS, metadata: { bookId: start.bookId } };

  assert.deepEqual(await recordStripePayment(store, ev("payment_intent.created", paid)), { action: "ignored", reason: "payment_intent.created" });
  assert.equal((await recordStripePayment(store, ev("checkout.session.completed", { ...paid, payment_status: "unpaid" }))).action, "ignored");
  assert.equal((await recordStripePayment(store, ev("checkout.session.completed", { ...paid, metadata: { bookId: "noexiste1" } }))).action, "ignored");
  assert.equal((await prepareCheckout(store, { bookId: start.bookId })).ok, true, "antes del pago se puede abrir el checkout");

  assert.deepEqual(await recordStripePayment(store, ev("checkout.session.completed", paid)), { action: "paid", bookId: start.bookId });
  assert.deepEqual(await recordStripePayment(store, ev("checkout.session.completed", paid)), { action: "duplicate", bookId: start.bookId });
  const v = await bookView(store, start.bookId);
  assert.ok(v.ok && v.paid);
  const again = await prepareCheckout(store, { bookId: start.bookId });
  assert.ok(!again.ok && again.error === "already_paid");
});

test("tras el pago: 12 páginas en segundo plano y el email de «listo» una sola vez", async () => {
  const { store, start } = await newBook();
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  const sent: string[] = [];
  const send = async (to: string, title: string, link: string) => {
    sent.push(`${to}|${title}|${link}`);
    return { sent: true };
  };
  const link = (id: string) => `https://cuentos.example/crear?b=${id}`;

  // sin pagar: ni páginas ni email
  assert.equal(await notifyBookReady(store, start.bookId, link, send), false);
  assert.ok(await payDryRun(store, { bookId: start.bookId }));
  const r = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok && r.created === 12);
  const ids = await pendingPageJobs(store, start.bookId);
  assert.equal(ids.length, 12);
  assert.equal(await notifyBookReady(store, start.bookId, link, send), false, "a medias no se avisa");

  const out = await paintAll(store, dryRunAdapter, ids, { concurrency: 3, deadline: Date.now() + 30_000 });
  assert.equal(Object.values(out).filter((o) => o === "done").length, 12);
  assert.deepEqual(await pendingPageJobs(store, start.bookId), []);

  assert.equal(await notifyBookReady(store, start.bookId, link, send), true);
  assert.equal(await notifyBookReady(store, start.bookId, link, send), false, "una sola vez");
  assert.deepEqual(sent, [`${email}|${plan.title}|https://cuentos.example/crear?b=${start.bookId}`]);

  // pedir las páginas otra vez (el navegador y el webhook a la vez) no crea más
  const twice = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(twice.ok && twice.created === 0);
});

test("el email que falla no se da por mandado", async () => {
  const { store, start } = await newBook();
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  await payDryRun(store, { bookId: start.bookId });
  await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, start.bookId), { deadline: Date.now() + 30_000 });
  const link = (id: string) => id;
  assert.equal(await notifyBookReady(store, start.bookId, link, async () => ({ sent: false })), false);
  assert.equal(await notifyBookReady(store, start.bookId, link, async () => ({ sent: true })), true, "se reintenta la siguiente vez");
});

test("GENERATION_PROVIDER: «gemini» y «nano-banana» son Nano Banana (gemini-images); lo desconocido falla", async () => {
  const { getAdapter, providerName, estimatedCostCents } = await import("../../lib/generation/adapter");
  for (const v of ["gemini-images", "gemini", "Gemini", " nano-banana ", "nanobanana"]) assert.equal(getAdapter(v).name, "gemini-images", v);
  assert.equal(getAdapter(undefined).name, process.env.GENERATION_PROVIDER ? providerName() : "dry-run");
  assert.equal(getAdapter("").name, "dry-run");
  assert.equal(estimatedCostCents("gemini", "2K"), 6, "el alias no puede saltarse el coste");
  assert.throws(() => getAdapter("midjourney"), /desconocido/);
});

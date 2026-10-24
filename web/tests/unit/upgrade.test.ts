/**
 * Pasar a tapa dura después de comprar el PDF (24 oct): se cobra la diferencia, el webhook crea un segundo pedido de tapa
 * dura y desde ahí todo sigue como la tapa dura comprada al principio. Sin red: Stripe, Gelato y Resend no se llaman.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, notifyBookReady, payDryRun, pendingPageJobs, prepareUpgrade, recordStripePayment, requestPages, startBook, upgradeOffer } from "../../lib/book/service";
import { startPrint } from "../../lib/book/print";
import { PRICE_CENTS, UPGRADE_CENTS, dayMonth, upgradeDeadline } from "../../lib/print/prices";
import { upgradeLine } from "../../lib/mail";
import { checkoutBody } from "../../lib/stripe";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const email = "vera@example.com";
const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" };
const DAY = 24 * 3600 * 1000;

async function book() {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  return { state, store, bookId: start.bookId };
}

async function paintPages(store: ReturnType<typeof memoryStore>, bookId: string) {
  const r = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok, JSON.stringify(r));
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
}

const session = (id: string, bookId: string, metadata: Record<string, string>, amount: number) => ({
  type: "checkout.session.completed",
  data: { object: { id, payment_status: "paid", amount_total: amount, metadata: { bookId, ...metadata } } },
});

test("precio y plazo: la diferencia, y se cierra un día antes de que caduque el libro", () => {
  assert.equal(UPGRADE_CENTS, PRICE_CENTS.hardcover - PRICE_CENTS.illustrated);
  assert.equal(UPGRADE_CENTS, 2000);
  const now = Date.parse("2026-10-24T10:00:00Z");
  assert.equal(upgradeDeadline("2026-11-13T10:00:00Z", now), "2026-11-12T10:00:00.000Z");
  assert.equal(upgradeDeadline(new Date(now + DAY - 1).toISOString(), now), null, "menos de un día: cerrada");
  assert.equal(upgradeDeadline(null, now), null);
  assert.equal(upgradeDeadline("no es fecha", now), null);
  assert.equal(dayMonth("2026-11-12T10:00:00Z"), "12 de noviembre");
  assert.deepEqual(upgradeOffer({ expiresAt: "2026-11-13T10:00:00Z" }, "illustrated", now), { cents: 2000, until: "2026-11-12T10:00:00.000Z" });
  assert.equal(upgradeOffer({ expiresAt: "2026-11-13T10:00:00Z" }, "hardcover", now), null);
  assert.equal(upgradeOffer({ expiresAt: "2026-11-13T10:00:00Z" }, null, now), null);
});

test("Stripe: la mejora lleva su marca, su nombre, la diferencia y la vuelta con ?mejora=1", () => {
  const p = checkoutBody({ bookId: "abc12345", email, title: "Vera y Toby", amountCents: UPGRADE_CENTS, origin: "https://x", edition: "hardcover", upgrade: true });
  assert.equal(p.get("metadata[upgrade]"), "1");
  assert.equal(p.get("payment_intent_data[metadata][upgrade]"), "1");
  assert.equal(p.get("metadata[edition]"), "hardcover");
  assert.equal(p.get("line_items[0][price_data][unit_amount]"), "2000");
  assert.match(p.get("line_items[0][price_data][product_data][name]")!, /^Pasar a tapa dura · Vera y Toby/);
  assert.match(p.get("line_items[0][price_data][product_data][description]")!, /El PDF ya lo tienes/);
  assert.equal(p.get("success_url"), "https://x/crear?b=abc12345&pagado=1&mejora=1");
  const normal = checkoutBody({ bookId: "abc12345", email, title: "Vera y Toby", amountCents: 3490, origin: "https://x", edition: "hardcover" });
  assert.equal(normal.get("metadata[upgrade]"), null);
  assert.equal(normal.get("success_url"), "https://x/crear?b=abc12345&pagado=1");
});

test("preparar la mejora: solo con el PDF pagado, con dirección válida y antes del plazo", async () => {
  const { state, store, bookId } = await book();
  assert.equal(((await prepareUpgrade(store, { bookId, shipping: ADDRESS })) as { error: string }).error, "not_paid");
  assert.ok((await payDryRun(store, { bookId, edition: "illustrated" })).ok);

  const sin = await prepareUpgrade(store, { bookId });
  assert.ok(!sin.ok && sin.error === "shipping");
  const canarias = await prepareUpgrade(store, { bookId, shipping: { ...ADDRESS, postcode: "38001" } });
  assert.ok(!canarias.ok && canarias.field === "postcode");
  const ok = await prepareUpgrade(store, { bookId, shipping: ADDRESS });
  assert.ok(ok.ok && ok.upgrade && ok.edition === "hardcover" && ok.amountCents === 2000, JSON.stringify(ok));

  // a menos de un día de caducar, ya no
  state.books.get(bookId)!.expiresAt = new Date(Date.now() + DAY / 2).toISOString();
  assert.equal(((await prepareUpgrade(store, { bookId, shipping: ADDRESS })) as { error: string }).error, "upgrade_closed");
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.upgrade === null, "la vista tampoco la ofrece");
});

test("webhook: la mejora crea el pedido de tapa dura una vez y lo deja esperando a «Mandar a imprimir»", async () => {
  const { store, bookId } = await book();
  assert.deepEqual(await recordStripePayment(store, session("cs_up_0", bookId, { edition: "hardcover", upgrade: "1" }, 2000)), { action: "ignored", reason: "upgrade:not_paid" });

  assert.deepEqual(await recordStripePayment(store, session("cs_pdf", bookId, { edition: "illustrated" }, 1490)), { action: "paid", bookId });
  const antes = await bookView(store, bookId);
  assert.ok(antes.ok && antes.edition === "illustrated" && antes.print === null);
  assert.equal(antes.upgrade?.cents, 2000);

  assert.ok((await prepareUpgrade(store, { bookId, shipping: ADDRESS })).ok);
  const up = session("cs_up_1", bookId, { edition: "hardcover", upgrade: "1" }, 2000);
  assert.deepEqual(await recordStripePayment(store, up), { action: "upgraded", bookId });
  assert.deepEqual(await recordStripePayment(store, up), { action: "duplicate", bookId }, "Stripe reintenta");
  assert.deepEqual(await recordStripePayment(store, session("cs_up_2", bookId, { edition: "hardcover", upgrade: "1" }, 2000)), { action: "ignored", reason: "upgrade:already_hardcover" });
  assert.deepEqual(await recordStripePayment(store, session("cs_pdf", bookId, { edition: "illustrated" }, 1490)), { action: "duplicate", bookId });

  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.paid && v.edition === "hardcover" && v.upgrade === null);
  assert.equal(v.print?.status, "awaiting_approval");
  assert.equal(v.print?.shipping?.postcode, "28013");
  const order = await store.getOrder((await store.findBook({ publicId: bookId }))!.id);
  assert.equal(order?.amountCents, 2000);
  assert.equal(order?.sessionId, "cs_up_1");
});

test("recorrido: PDF, email con la oferta, mejora de prueba y a la imprenta sin repintar", async () => {
  const { store, bookId } = await book();
  assert.ok((await payDryRun(store, { bookId, edition: "illustrated" })).ok);
  await paintPages(store, bookId);
  const jobs = (await bookView(store, bookId) as { jobs: unknown[] }).jobs.length;

  const sent: unknown[][] = [];
  const mailed = await notifyBookReady(store, bookId, (id) => `https://www.erasesuvez.com/crear?b=${id}`, async (...args) => (sent.push(args), { sent: true }));
  assert.ok(mailed);
  assert.equal(sent[0][3], "illustrated");
  const offer = sent[0][4] as { cents: number; until: string };
  assert.equal(offer.cents, 2000);
  const line = upgradeLine(offer);
  assert.match(line, /pagas solo la diferencia, 20,00 €/);
  assert.match(line, new RegExp(`hasta el ${dayMonth(offer.until)}\\.$`));

  assert.ok((await payDryRun(store, { bookId, upgrade: true, shipping: ADDRESS })).ok);
  assert.equal(((await payDryRun(store, { bookId, upgrade: true, shipping: ADDRESS })) as { error: string }).error, "already_hardcover");
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.edition === "hardcover" && v.print?.status === "awaiting_approval");
  assert.equal(v.jobs.length, jobs, "no se pinta nada nuevo");

  const r = await startPrint(store, bookId, "dry-run");
  assert.ok(r.ok, JSON.stringify(r));
});

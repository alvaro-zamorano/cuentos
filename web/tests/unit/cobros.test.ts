/**
 * Cobros de Stripe que no acaban bien (auditoría 26 oct, B7 y B3): ninguno se pierde sin aviso, el libro dura 30 días
 * desde el pago y la sesión de pago caduca pronto. Sin red: memoria y dry-run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState, type GenStore } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, paymentNotice, recordStripePayment, startBook, type PaidEvent } from "../../lib/book/service";
import { CHECKOUT_TTL_S, checkoutBody } from "../../lib/stripe";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const DAY = 24 * 3600 * 1000;

async function book() {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  return { state, store, bookId: start.bookId };
}

const session = (id: string, bookId: string, over: Partial<PaidEvent["data"]["object"]> = {}): PaidEvent => ({
  type: "checkout.session.completed",
  data: { object: { id, payment_status: "paid", amount_total: 1490, currency: "eur", metadata: { bookId, edition: "illustrated" }, ...over } },
});

test("pagar alarga el libro 30 días desde el pago, no desde que se empezó (B3)", async () => {
  const { state, store, bookId } = await book();
  state.books.get(bookId)!.expiresAt = new Date(Date.now() + DAY).toISOString(); // empezado hace 29 días
  assert.equal((await recordStripePayment(store, session("cs_1", bookId))).action, "paid");
  const left = Date.parse(state.books.get(bookId)!.expiresAt!) - Date.now();
  assert.ok(left > 29.9 * DAY, `quedan ${(left / DAY).toFixed(1)} días`);
});

test("un cobro que llega con el libro ya caducado (pero aún guardado) se registra y lo alarga (B7)", async () => {
  const { state, store, bookId } = await book();
  state.books.get(bookId)!.expiresAt = new Date(Date.now() - 3600_000).toISOString();
  assert.equal((await bookView(store, bookId) as { error: string }).error, "not_found", "caducado: el enlace ya no abre");
  assert.equal((await recordStripePayment(store, session("cs_tarde", bookId))).action, "paid");
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.paid, "y vuelve a abrirse, pagado");
});

test("si la base falla al buscar el libro, el cobro no se da por perdido: lanza y el webhook responde 500 (B7)", async () => {
  const { store, bookId } = await book();
  const broken: GenStore = { ...store, findBook: async () => Promise.reject(new Error("books: timeout")) };
  await assert.rejects(recordStripePayment(broken, session("cs_1", bookId)), /timeout/);
});

test("cobro de un libro que ya no existe: se ignora y se avisa para devolverlo (B7)", async () => {
  const { store } = await book();
  const ev = session("cs_x", "zzzzzzzzzz");
  const r = await recordStripePayment(store, ev);
  assert.deepEqual(r, { action: "ignored", reason: "book:not_found" });
  const n = paymentNotice(r, ev);
  assert.equal(n?.subject, "Cobro sin pedido");
  assert.match(n!.text, /cs_x/);
  assert.match(n!.text, /14\.90 EUR/);
  assert.match(n!.text, /devuélvelo desde el panel de Stripe/);
});

test("otra sesión pagada para un libro ya pagado es un cobro doble, con aviso; la misma sesión, no (B7)", async () => {
  const { store, bookId } = await book();
  assert.equal((await recordStripePayment(store, session("cs_a", bookId))).action, "paid");
  const again = await recordStripePayment(store, session("cs_a", bookId));
  assert.deepEqual(again, { action: "duplicate", bookId });
  assert.equal(paymentNotice(again, session("cs_a", bookId)), null, "Stripe reintenta: nada que avisar");
  const other = session("cs_b", bookId);
  const r = await recordStripePayment(store, other);
  assert.deepEqual(r, { action: "double_charge", bookId, already: "illustrated" });
  assert.equal(paymentNotice(r, other)?.subject, "Cobro doble de un libro ya pagado");
});

test("importe o moneda que no cuadran: el pedido se registra igual y se avisa (B7)", async () => {
  const { store, bookId } = await book();
  const ev = session("cs_raro", bookId, { amount_total: 990, currency: "usd" });
  const r = await recordStripePayment(store, ev);
  assert.equal(r.action, "paid");
  assert.equal((r as { mismatch?: string }).mismatch, "importe 990 c, se esperaban 1490 c; moneda usd");
  assert.equal(paymentNotice(r, ev)?.subject, "Cobro con un importe que no cuadra");
  const ok = await book();
  const r2 = await recordStripePayment(ok.store, session("cs_bien", ok.bookId));
  assert.deepEqual(r2, { action: "paid", bookId: ok.bookId });
  assert.equal(paymentNotice(r2, session("cs_bien", ok.bookId)), null);
});

test("lo que no es un cobro no avisa", () => {
  const unpaid: PaidEvent = { type: "checkout.session.completed", data: { object: { id: "cs_1", payment_status: "unpaid", metadata: { bookId: "abcdefgh12" } } } };
  assert.equal(paymentNotice({ action: "ignored", reason: "payment_status:unpaid" }, unpaid), null);
  const other: PaidEvent = { type: "charge.refunded", data: { object: { id: "ch_1" } } };
  assert.equal(paymentNotice({ action: "ignored", reason: "charge.refunded" }, other), null);
});

test("la sesión de pago caduca a los 35 minutos (B7)", () => {
  const now = Date.parse("2026-10-26T10:00:00Z");
  const p = checkoutBody({ bookId: "abcdefgh12", email: null, amountCents: 1490, origin: "https://x" }, now);
  assert.equal(CHECKOUT_TTL_S, 35 * 60);
  assert.equal(p.get("expires_at"), String(now / 1000 + 35 * 60));
});

test("el almacén en memoria, como Supabase: un libro caducado no existe salvo para registrar un cobro", async () => {
  const { state, store, bookId } = await book();
  state.books.get(bookId)!.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(await store.findBook({ publicId: bookId }), null);
  assert.equal((await store.findBook({ publicId: bookId, includeExpired: true }))?.public_id, bookId);
});

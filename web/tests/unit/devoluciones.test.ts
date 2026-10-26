/**
 * Devoluciones y disputas de Stripe (I5) y recibo de compra (I28), auditoría 26 oct. Sin red: memoria, dry-run y una
 * Stripe de mentira que sabe de qué sesión es cada PaymentIntent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, mailReceipt, recordStripePayment, startBook, type PaidEvent } from "../../lib/book/service";
import { chargeNotice, DISPUTE_HOLD, recordChargeEvent, type ChargeEvent } from "../../lib/book/refunds";
import { startPrint } from "../../lib/book/print";
import { receiptLines, type Receipt } from "../../lib/mail";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const link = (id: string) => `https://www.erasesuvez.com/crear?b=${id}`;
const SHIPPING = { name: "Ana Pérez", line1: "Calle Mayor 1, 3º B", postcode: "28013", city: "Madrid", province: "Madrid", country: "ES" };

async function paidBook(edition: "illustrated" | "hardcover" = "illustrated") {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  const ev: PaidEvent = {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        amount_total: edition === "hardcover" ? 3990 : 1490,
        currency: "eur",
        customer_details: { email: "pago@example.com" },
        metadata: { bookId: start.bookId, edition, withdrawal_waiver_at: "2026-10-26T17:04:00.000Z" },
      },
    },
  };
  if (edition === "hardcover") {
    // la dirección viaja en el borrador hasta que llega el pago
    const b = state.books.get(start.bookId)!;
    (b.raw as { shipping?: unknown }).shipping = SHIPPING;
  }
  const r = await recordStripePayment(store, ev);
  assert.equal(r.action, "paid");
  return { state, store, bookId: start.bookId, ev, r };
}

/** Stripe de mentira: pi_1 es la sesión cs_test_1. */
const stripe = { sessionOf: async (pi: string) => ({ id: pi === "pi_1" ? "cs_test_1" : null }) };
const refund = (over: Partial<ChargeEvent["data"]["object"]> = {}): ChargeEvent => ({
  type: "charge.refunded",
  data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 1490, amount_refunded: 1490, refunded: true, currency: "eur", ...over } },
});
const dispute = (type: string, over: Partial<ChargeEvent["data"]["object"]> = {}): ChargeEvent => ({
  type,
  data: { object: { id: "dp_1", charge: "ch_1", payment_intent: "pi_1", amount: 3990, currency: "eur", reason: "fraudulent", status: "needs_response", evidence_details: { due_by: 1_793_000_000 }, ...over } },
});

test("devolución entera: el libro deja de estar pagado (sin descarga) y soporte lo sabe; la segunda vez no hace nada", async () => {
  const { store, bookId } = await paidBook();
  assert.ok(((await bookView(store, bookId)) as { paid: boolean }).paid);
  const r = await recordChargeEvent(store, refund(), stripe);
  assert.equal(r.action, "refunded");
  assert.ok(r.action === "refunded" && r.print === "none" && r.via === "refund");
  const v = await bookView(store, bookId);
  assert.ok(v.ok && !v.paid, "la descarga del PDF mira `paid`");
  const n = chargeNotice(r, refund(), link)!;
  assert.match(n.subject, /^Devolución: «Vera y la gran idea»/);
  assert.match(n.text, /ya no se descarga ni se manda a imprimir/);
  assert.match(n.text, new RegExp(`crear\\?b=${bookId}`));
  assert.equal((await recordChargeEvent(store, refund(), stripe)).action, "duplicate");
});

test("devolución parcial: el pedido sigue pagado y solo se avisa", async () => {
  const { store, bookId } = await paidBook();
  const ev = refund({ refunded: false, amount_refunded: 500 });
  const r = await recordChargeEvent(store, ev, stripe);
  assert.equal(r.action, "partial_refund");
  assert.ok(((await bookView(store, bookId)) as { paid: boolean }).paid);
  assert.match(chargeNotice(r, ev, link)!.text, /Se han devuelto 5,00 € de 14,90 €/);
});

test("devolución de una tapa dura que no ha salido: se cancela y ya no se puede mandar a imprimir", async () => {
  const { store, bookId } = await paidBook("hardcover");
  const r = await recordChargeEvent(store, refund({ amount: 3990, amount_refunded: 3990 }), stripe);
  assert.ok(r.action === "refunded" && r.print === "held");
  const sent = await startPrint(store, bookId, "dry-run");
  assert.ok(!sent.ok, "sin pedido pagado no hay imprenta");
});

test("devolución de una tapa dura que ya está en la imprenta: el aviso pide pararla en Gelato", async () => {
  const { store } = await paidBook("hardcover");
  const order = (await store.getOrderBySession("cs_test_1"))!;
  await store.updateOrder(order.id, { printStatus: "sent", printOrderId: "g_1" });
  const ev = refund({ amount: 3990, amount_refunded: 3990 });
  const r = await recordChargeEvent(store, ev, stripe);
  assert.ok(r.action === "refunded" && r.print === "at_printer");
  assert.match(chargeNotice(r, ev, link)!.text, /Cancélala en Gelato/);
});

test("disputa: la tapa dura que no ha salido se para con plazo para responder; ganada, vuelve a esperar al padre", async () => {
  const { store, bookId } = await paidBook("hardcover");
  const opened = dispute("charge.dispute.created");
  const r = await recordChargeEvent(store, opened, stripe);
  assert.ok(r.action === "disputed" && r.print === "held");
  let order = (await store.getOrderBySession("cs_test_1"))!;
  assert.equal(order.printStatus, "canceled");
  assert.equal(order.printError, DISPUTE_HOLD);
  assert.ok(((await bookView(store, bookId)) as { paid: boolean }).paid, "la descarga sigue mientras se resuelve");
  const n = chargeNotice(r, opened, link)!;
  assert.match(n.subject, /^Disputa abierta/);
  assert.match(n.text, /\(fraudulent\).*antes del \d+ de [a-z]+ de 20\d\d/);
  assert.equal((await recordChargeEvent(store, opened, stripe)).action, "duplicate");

  const won = await recordChargeEvent(store, dispute("charge.dispute.closed", { status: "won" }), stripe);
  assert.ok(won.action === "dispute_won" && won.print === "reopened");
  order = (await store.getOrderBySession("cs_test_1"))!;
  assert.equal(order.printStatus, "awaiting_approval");
  assert.equal(order.printError, null);
});

test("disputa perdida: como una devolución entera", async () => {
  const { store, bookId } = await paidBook("hardcover");
  await recordChargeEvent(store, dispute("charge.dispute.created"), stripe);
  const lost = await recordChargeEvent(store, dispute("charge.dispute.closed", { status: "lost" }), stripe);
  assert.ok(lost.action === "refunded" && lost.via === "dispute_lost");
  assert.ok(!((await bookView(store, bookId)) as { paid: boolean }).paid);
  assert.match(chargeNotice(lost, dispute("charge.dispute.closed", { status: "lost" }), link)!.subject, /^Disputa perdida/);
});

test("devolución que no sabemos de qué pedido es: aviso con lo que trae; si Stripe falla, lanza para que reintente", async () => {
  const { store } = await paidBook();
  const ev = refund({ payment_intent: "pi_otro", metadata: { bookId: "abc" } });
  const r = await recordChargeEvent(store, ev, stripe);
  assert.equal(r.action, "unmatched");
  assert.match(chargeNotice(r, ev, link)!.text, /pi_otro[^]*abc/);
  const noKey = await recordChargeEvent(store, refund(), { sessionOf: async () => ({ error: "stripe_401" }) });
  assert.ok(noKey.action === "unmatched" && /stripe_401/.test(noKey.reason));
  await assert.rejects(recordChargeEvent(store, refund(), { sessionOf: async () => Promise.reject(new Error("stripe_503")) }), /stripe_503/);
});

test("cada entorno solo toca sus pedidos: la preview no marca un cobro real", async () => {
  const { store, bookId } = await paidBook();
  const live = { sessionOf: async () => ({ id: "cs_live_9" }) };
  await store.addPaidOrder((await store.findBook({ publicId: bookId }))!.id, { amountCents: 1490, edition: "illustrated", sessionId: "cs_live_9" });
  const r = await recordChargeEvent(store, refund(), { ...live, env: { VERCEL_ENV: "preview" } });
  assert.deepEqual(r, { action: "ignored", reason: "otro entorno" });
});

test("recibo (I28): edición, total con IVA, renuncia con su fecha, condiciones y quién vende; una vez por sesión", async () => {
  const { store, bookId, ev, r } = await paidBook("hardcover");
  const sent: { to: string; receipt: Receipt }[] = [];
  const deps = {
    send: async (to: string, receipt: Receipt) => (sent.push({ to, receipt }), { sent: true }),
    link,
    conditionsLink: "https://www.erasesuvez.com/condiciones",
    seller: "Érase su vez",
    contact: "hola@erasesuvez.com",
  };
  assert.equal(await mailReceipt(store, r, ev, deps), true);
  assert.equal(sent[0].to, "pago@example.com", "al email con el que se pagó");
  const { facts, notes } = receiptLines(sent[0].receipt);
  const f = Object.fromEntries(facts);
  assert.equal(f["Pedido"], "Libro de tapa dura con envío a casa, y el PDF");
  assert.equal(f["Total pagado"], "39,90 €, IVA incluido");
  assert.equal(f["Envío a"], "Calle Mayor 1, 3º B, 28013 Madrid, Madrid");
  assert.ok(notes.some((n) => /no puedes desistir de la compra\. Lo aceptaste el 26 de octubre de 2026 a las 18:04 \(hora de Madrid\)/.test(n)));
  assert.ok(notes.includes("Condiciones de compra: https://www.erasesuvez.com/condiciones"));
  assert.ok(notes.some((n) => n.startsWith("Vende: Érase su vez. Para cualquier cosa, escríbenos a hola@erasesuvez.com")));
  assert.ok(notes.some((n) => /no se imprime hasta que la mandes a imprimir/.test(n)));
  // Stripe reintenta: «duplicate», pero el recibo ya salió
  const again = await recordStripePayment(store, ev);
  assert.equal(again.action, "duplicate");
  assert.equal(await mailReceipt(store, again, ev, deps), false);
  assert.equal(sent.length, 1);
  void bookId;
});

test("recibo: si el correo falla, se manda cuando Stripe reintenta; un pedido devuelto no lleva recibo", async () => {
  const { store, ev, r } = await paidBook();
  let ok = false;
  const deps = { send: async () => ({ sent: ok }), link, conditionsLink: "c", seller: "Érase su vez", contact: null };
  assert.equal(await mailReceipt(store, r, ev, deps), false);
  ok = true;
  assert.equal(await mailReceipt(store, { action: "duplicate", bookId: r.action === "paid" ? r.bookId : "" }, ev, deps), true);
  const other = await paidBook();
  await recordChargeEvent(other.store, refund(), stripe);
  assert.equal(await mailReceipt(other.store, other.r, other.ev, deps), false);
});

test("recibo del PDF sin renuncia en los metadatos: sin esa línea y sin envío", async () => {
  const lines = receiptLines({
    title: "T",
    kind: "illustrated",
    amountCents: 1490,
    paidAt: "2026-10-26T10:00:00Z",
    address: null,
    waiverAt: null,
    link: "l",
    conditionsLink: "c",
    seller: "Érase su vez",
    contact: null,
  });
  const f = Object.fromEntries(lines.facts);
  assert.equal(f["Total pagado"], "14,90 €, IVA incluido");
  assert.equal(f["Envío a"], undefined);
  assert.ok(!lines.notes.some((n) => /desistir/.test(n)));
  assert.equal(lines.notes.at(-1), "Vende: Érase su vez.");
});

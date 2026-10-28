/**
 * Una compra, un libro impreso (revisión 27 oct, a petición de Álvaro): ni dos clics, ni dos cobros que llegan a la vez,
 * ni dos mejoras pagadas a la vez dejan dos tapas duras por imprimir. El cobro de más queda con aviso a soporte para
 * devolverlo, y devolverlo no para la tapa dura buena. Sin red: memoria, pago simulado e imprenta de prueba.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState, type GenStore } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { payDryRun, paymentNotice, pendingPageJobs, recordStripePayment, requestPages, retryUnsentNotice, startBook, type PaidEvent } from "../../lib/book/service";
import { completePrint, startPrint } from "../../lib/book/print";
import { chargeNotice, recordChargeEvent, type ChargeEvent } from "../../lib/book/refunds";
import { estimatedCover } from "../../lib/print/gelato";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);

async function book() {
  const state = newMemoryState();
  const plain = memoryStore(state);
  const store: GenStore = { ...plain, signedUrl: async (p: string) => `https://files.example/${p}` };
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  return { state, store, bookId: start.bookId };
}

const paid = (id: string, bookId: string, metadata: Record<string, string>, amount: number): PaidEvent => ({
  type: "checkout.session.completed",
  data: { object: { id, payment_status: "paid", amount_total: amount, currency: "eur", metadata: { bookId, ...metadata } } },
});
const hardcover = (id: string, bookId: string) => paid(id, bookId, { edition: "hardcover" }, 3490);
const pdf = (id: string, bookId: string) => paid(id, bookId, { edition: "illustrated" }, 1490);
const upgrade = (id: string, bookId: string) => paid(id, bookId, { edition: "hardcover", upgrade: "1" }, 2500);

const paidOrders = (state: ReturnType<typeof newMemoryState>) => [...(state.orders?.values() ?? [])].filter((o) => (o.status ?? "paid") === "paid");
const refundOf = (sessionId: string): [ChargeEvent, { sessionOf: () => Promise<{ id: string }>; env: Record<string, string> }] => [
  { type: "charge.refunded", data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 3490, amount_refunded: 3490, refunded: true } } },
  { sessionOf: async () => ({ id: sessionId }), env: {} },
];

test("dos cobros de tapa dura del mismo libro a la vez: un pedido, y el otro es un cobro doble con aviso", async () => {
  const { state, store, bookId } = await book();
  const [a, b] = await Promise.all([recordStripePayment(store, hardcover("cs_1", bookId), {}), recordStripePayment(store, hardcover("cs_2", bookId), {})]);
  assert.deepEqual([a.action, b.action].sort(), ["double_charge", "paid"]);
  const orders = paidOrders(state);
  assert.equal(orders.length, 1, "una sola tapa dura por imprimir");
  const extra = a.action === "double_charge" ? "cs_1" : "cs_2";
  const notice = paymentNotice(a.action === "double_charge" ? a : b, hardcover(extra, bookId));
  assert.equal(notice?.subject, "Cobro doble de un libro ya pagado");
  assert.match(notice!.text, new RegExp(extra));
  // soporte devuelve el cobro de más: no tiene pedido, así que no toca la tapa dura buena
  const r = await recordChargeEvent(store, ...refundOf(extra));
  assert.equal(r.action, "ignored");
  assert.equal((await store.getOrder(orders[0].bookId))?.printStatus, "awaiting_approval");
});

test("dos mejoras a tapa dura pagadas a la vez: una tapa dura, y la otra mejora queda sin registrar con aviso", async () => {
  const { state, store, bookId } = await book();
  assert.equal((await recordStripePayment(store, pdf("cs_pdf", bookId), {})).action, "paid");
  const [a, b] = await Promise.all([recordStripePayment(store, upgrade("cs_up1", bookId), {}), recordStripePayment(store, upgrade("cs_up2", bookId), {})]);
  assert.deepEqual([a.action, b.action].sort(), ["ignored", "upgraded"]);
  assert.equal(paidOrders(state).filter((o) => o.edition === "hardcover").length, 1);
  const ignored = a.action === "ignored" ? a : b;
  assert.deepEqual(ignored, { action: "ignored", reason: "upgrade:already_hardcover" });
  assert.equal(paymentNotice(ignored, upgrade("cs_upX", bookId))?.subject, "Mejora a tapa dura cobrada sin registrar");
});

test("si otro cobro del mismo libro tiene el bloqueo, no se registra a ciegas: lanza y Stripe reintenta", async () => {
  const { state, store, bookId } = await book();
  const uuid = (await store.findBook({ publicId: bookId }))!.id;
  assert.ok(await store.lock(`pago:${uuid}`, 60_000), "otro cobro a medias");
  await assert.rejects(recordStripePayment(store, hardcover("cs_1", bookId), {}, { lockWaitMs: 300 }), /pago_ocupado/);
  assert.equal(paidOrders(state).length, 0);
});

test("si registrar el cobro falla, el bloqueo se suelta y el reintento de Stripe entra", async () => {
  const { state, store, bookId } = await book();
  const broken: GenStore = { ...store, addPaidOrder: async () => Promise.reject(new Error("orders: timeout")) };
  await assert.rejects(recordStripePayment(broken, hardcover("cs_1", bookId), {}, { lockWaitMs: 300 }), /timeout/);
  assert.equal((await recordStripePayment(store, hardcover("cs_1", bookId), {}, { lockWaitMs: 300 })).action, "paid");
  assert.equal(paidOrders(state).length, 1);
});

test("el reintento de Stripe de una sesión ya devuelta no es un pago nuevo ni un cobro doble", async () => {
  const { state, store, bookId } = await book();
  assert.equal((await recordStripePayment(store, hardcover("cs_1", bookId), {})).action, "paid");
  assert.equal((await recordChargeEvent(store, ...refundOf("cs_1"))).action, "refunded");
  const again = await recordStripePayment(store, hardcover("cs_1", bookId), {});
  assert.deepEqual(again, { action: "duplicate", bookId });
  assert.equal(paymentNotice(again, hardcover("cs_1", bookId)), null, "nada que avisar");
  assert.equal(paidOrders(state).length, 0, "sigue devuelto: ni se descarga ni se imprime");
});

test("cobro doble de otra edición (PDF y tapa dura en dos pestañas): el aviso dice las dos y pide preguntar antes de devolver", async () => {
  const { store, bookId } = await book();
  assert.equal((await recordStripePayment(store, pdf("cs_pdf", bookId), {})).action, "paid");
  const ev = hardcover("cs_tapa", bookId);
  const r = await recordStripePayment(store, ev, {});
  assert.deepEqual(r, { action: "double_charge", bookId, already: "illustrated" });
  const n = paymentNotice(r, ev)!;
  assert.match(n.text, /ya estaba pagado \(Libro ilustrado en PDF\).*\(Libro de tapa dura\)/);
  assert.match(n.text, /pregunta al cliente cuál quiere/);
  assert.doesNotMatch(n.text, /Devuelve este segundo cobro/);
  // la misma edición dos veces: devolver el segundo
  const ev2 = pdf("cs_pdf2", bookId);
  assert.match(paymentNotice(await recordStripePayment(store, ev2, {}), ev2)!.text, /Devuelve este segundo cobro/);
});

test("pagada la tapa dura, «Mandar a imprimir» dos veces a la vez y otra vez después crean un solo pedido en la imprenta", async () => {
  const { store, bookId } = await book();
  assert.equal((await recordStripePayment(store, hardcover("cs_1", bookId), {})).action, "paid");
  const uuid = (await store.findBook({ publicId: bookId }))!.id;
  await store.updateOrder((await store.getOrder(uuid))!.id, { shipping: { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid", country: "ES" } });
  assert.ok((await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM)).ok);
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
  for (const j of await store.listJobs(uuid)) if (j.status === "done") await store.updateJob(j.id, { storage_path: `books/x/${j.id}.png` });

  const clicks = await Promise.all([startPrint(store, bookId, "gelato", {}), startPrint(store, bookId, "gelato", {})]);
  const ok = clicks.filter((c) => c.ok) as { ok: true; orderId: string }[];
  assert.equal(ok.length, 1, "un clic gana");
  assert.equal((clicks.find((c) => !c.ok) as { error: string }).error, "already_sent");

  const created: string[] = [];
  const done = await completePrint(store, ok[0].orderId, {
    mode: "gelato",
    orderType: "draft",
    pageCount: 30,
    resolveProductUid: async () => "photobooks-hardcover_x",
    productSize: async () => ({ trimWidth: 280, trimHeight: 210, bleed: 4 }),
    coverGeometry: async () => estimatedCover(),
    estimatedCover,
    render: async () => new Uint8Array([37, 80, 68, 70]),
    createOrder: async (i) => (created.push(i.orderReferenceId), { id: "gel-1-abcdef", status: "created", orderReferenceId: i.orderReferenceId, trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null }),
    getOrder: async () => null,
    findOrders: async () => [],
    mail: { sentToPrint: async () => ({ sent: true }), shipped: async () => ({ sent: true }), reminder: async () => ({ sent: true }) },
    link: (id) => `https://www.erasesuvez.com/crear?b=${id}`,
    trackLink: (id) => `https://www.erasesuvez.com/seguimiento/${id}`,
    notify: async () => ({ sent: true }),
  });
  assert.ok("ok" in done && done.ok, JSON.stringify(done));
  assert.equal(created.length, 1);
  assert.equal(((await startPrint(store, bookId, "gelato", {})) as { error: string }).error, "already_sent", "mandado: no se puede volver a mandar");
});

test("si el bloqueo no basta (caducado con un cobro a medias), la base no deja entrar la segunda tapa dura: cobro doble con aviso", async () => {
  const { state, store, bookId } = await book();
  // un bloqueo que no bloquea: como si hubiera caducado
  const loose: GenStore = { ...store, lock: async () => crypto.randomUUID(), unlock: async () => undefined };
  const [a, b] = await Promise.all([recordStripePayment(loose, hardcover("cs_1", bookId), {}), recordStripePayment(loose, hardcover("cs_2", bookId), {})]);
  assert.deepEqual([a.action, b.action].sort(), ["double_charge", "paid"]);
  assert.equal(paidOrders(state).filter((o) => o.edition === "hardcover").length, 1);
  const extra = a.action === "double_charge" ? a : b;
  assert.equal(paymentNotice(extra, hardcover("cs_x", bookId))?.subject, "Cobro doble de un libro ya pagado");
  // dos mejoras igual: una tapa dura y la otra mejora sin registrar, con aviso
  const other = await book();
  assert.equal((await recordStripePayment(other.store, pdf("cs_pdf", other.bookId), {})).action, "paid");
  const loose2: GenStore = { ...other.store, lock: async () => crypto.randomUUID(), unlock: async () => undefined };
  const ups = await Promise.all([recordStripePayment(loose2, upgrade("cs_u1", other.bookId), {}), recordStripePayment(loose2, upgrade("cs_u2", other.bookId), {})]);
  assert.deepEqual(ups.map((u) => u.action).sort(), ["ignored", "upgraded"]);
  assert.equal(paidOrders(other.state).filter((o) => o.edition === "hardcover").length, 1);
});

test("aviso a soporte que no sale: 500 para que Stripe reintente solo si el fallo es pasajero", () => {
  assert.equal(retryUnsentNotice({ sent: false, reason: "red" }), true);
  assert.equal(retryUnsentNotice({ sent: false, reason: "error" }), true);
  assert.equal(retryUnsentNotice({ sent: false, reason: "resend_503" }), true);
  assert.equal(retryUnsentNotice({ sent: false, reason: "resend_429" }), true);
  assert.equal(retryUnsentNotice({ sent: true }), false, "salió");
  assert.equal(retryUnsentNotice({ sent: false, reason: "sin_destino" }), false, "sin MAIL_FORWARD_TO");
  assert.equal(retryUnsentNotice({ sent: false, reason: "sin_configurar" }), false, "sin Resend");
  assert.equal(retryUnsentNotice({ sent: false, reason: "resend_422" }), false, "Resend lo rechaza");
});

test("el reintento de Stripe vuelve a dar el aviso que cambió la base: importe que no cuadra, devolución y disputa", async () => {
  // pago con un importe que no cuadra: el reintento es un duplicado que lo vuelve a contar
  const { store, bookId } = await book();
  const odd = paid("cs_odd", bookId, { edition: "illustrated" }, 990);
  const first = await recordStripePayment(store, odd, {});
  assert.equal(first.action, "paid");
  const again = await recordStripePayment(store, odd, {});
  assert.equal(again.action, "duplicate");
  assert.deepEqual(paymentNotice(again, odd), paymentNotice(first, odd));
  // un duplicado normal no avisa de nada
  const other = await book();
  const ok = pdf("cs_ok", other.bookId);
  assert.equal((await recordStripePayment(other.store, ok, {})).action, "paid");
  const okAgain = await recordStripePayment(other.store, ok, {});
  assert.equal(okAgain.action, "duplicate");
  assert.equal(paymentNotice(okAgain, ok), null);

  // devolución de una tapa dura que no había salido: el reintento da el mismo aviso
  const hc = await book();
  assert.equal((await recordStripePayment(hc.store, hardcover("cs_hc", hc.bookId), {})).action, "paid");
  const [ev, deps] = refundOf("cs_hc");
  const refunded = await recordChargeEvent(hc.store, ev, deps);
  assert.ok(refunded.action === "refunded" && refunded.print === "held");
  const dup = await recordChargeEvent(hc.store, ev, deps);
  assert.equal(dup.action, "duplicate");
  assert.deepEqual(chargeNotice(dup, ev), chargeNotice(refunded, ev));
  // una disputa perdida de lo ya devuelto también se cuenta
  const lost: ChargeEvent = { type: "charge.dispute.closed", data: { object: { id: "dp_1", charge: "ch_1", payment_intent: "pi_1", amount: 3490, status: "lost" } } };
  assert.match(chargeNotice(await recordChargeEvent(hc.store, lost, deps), lost)!.subject, /^Disputa perdida/);

  // disputa abierta: el reintento repite el aviso con su plazo
  const dp = await book();
  assert.equal((await recordStripePayment(dp.store, hardcover("cs_dp", dp.bookId), {})).action, "paid");
  const opened: ChargeEvent = { type: "charge.dispute.created", data: { object: { id: "dp_2", charge: "ch_2", payment_intent: "pi_2", amount: 3490, reason: "fraudulent", status: "needs_response", evidence_details: { due_by: 1_793_000_000 } } } };
  const dpDeps = { sessionOf: async () => ({ id: "cs_dp" }), env: {} };
  const d1 = await recordChargeEvent(dp.store, opened, dpDeps);
  const d2 = await recordChargeEvent(dp.store, opened, dpDeps);
  assert.equal(d2.action, "duplicate");
  assert.deepEqual(chargeNotice(d2, opened), chargeNotice(d1, opened));
});

test("la misma sesión entregada dos veces a la vez, con la base quejándose por la tapa dura: duplicado, no cobro doble", async () => {
  const { state, store, bookId } = await book();
  // Postgres puede saltar por cualquiera de los dos índices únicos; en memoria, como si saltara el de la tapa dura
  const loose: GenStore = {
    ...store,
    lock: async () => crypto.randomUUID(),
    unlock: async () => undefined,
    addPaidOrder: async (id, o) => {
      const r = await store.addPaidOrder(id, o);
      return r === "same_session" ? "hardcover_taken" : r;
    },
  };
  const ev = hardcover("cs_1", bookId);
  const [a, b] = await Promise.all([recordStripePayment(loose, ev, {}), recordStripePayment(loose, ev, {})]);
  assert.deepEqual([a.action, b.action].sort(), ["duplicate", "paid"]);
  assert.equal(paidOrders(state).length, 1);
});

test("pago simulado de la mejora: si ya hay otra tapa dura, no dice que ha ido bien", async () => {
  const { store, bookId } = await book();
  assert.ok((await payDryRun(store, { bookId, edition: "illustrated" })).ok);
  const taken: GenStore = { ...store, addPaidOrder: async () => "hardcover_taken" };
  const r = await payDryRun(taken, { bookId, upgrade: true, shipping: { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid", country: "ES" } });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, "already_hardcover");
});

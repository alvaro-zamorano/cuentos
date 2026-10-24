/**
 * Seguimiento propio del libro impreso (24 oct): envío económico explícito, lo que se guarda de Gelato (método, entrega
 * estimada, número de seguimiento, fecha de cada hito), la página /seguimiento/<id> y los emails que llevan a ella.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, payDryRun, pendingPageJobs, requestPages, startBook } from "../../lib/book/service";
import { completePrint, mergeInfo, refreshPrint, startPrint, trackingView, type PrintDeps } from "../../lib/book/print";
import { estimatedCover, gelatoOrderBody, gelatoShipmentMethod, parseOrder, type GelatoOrder } from "../../lib/print/gelato";
import { cleanShipping } from "../../lib/print/shipping";
import { dayLabel, etaLabel, trackSteps } from "../../lib/print/tracking";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const email = "vera@example.com";
const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", line2: "3º B", postcode: "28013", city: "Madrid", phone: "600 111 222" };
const GEL0: GelatoOrder = { id: "gel-0001-abcd", status: "created", orderReferenceId: null, trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null };

async function sentBook(now: Date) {
  const store = memoryStore(newMemoryState());
  const start = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  const bookId = start.bookId;
  await payDryRun(store, { bookId, edition: "hardcover", shipping: ADDRESS });
  const r = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok, JSON.stringify(r));
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, bookId), { concurrency: 3, deadline: Date.now() + 30_000 });

  const mails: string[] = [];
  const orders: Parameters<PrintDeps["createOrder"]>[0][] = [];
  let gelato: GelatoOrder = { ...GEL0 };
  let clock = now;
  const deps: PrintDeps = {
    mode: "gelato",
    orderType: "draft",
    shipmentMethod: "normal",
    pageCount: 30,
    resolveProductUid: async () => "photobooks-hardcover_pf_210x280-mm-8x11-inch_pt_170-gsm_hor",
    productSize: async () => ({ trimWidth: 280, trimHeight: 210, bleed: 4 }),
    coverGeometry: async () => estimatedCover(),
    estimatedCover,
    render: async () => new Uint8Array([37, 80, 68, 70]),
    createOrder: async (i) => (orders.push(i), (gelato = { ...gelato, orderReferenceId: i.orderReferenceId })),
    getOrder: async () => gelato,
    mail: {
      sentToPrint: async (to, _t, link) => (mails.push(`imprenta|${to}|${link}`), { sent: true }),
      shipped: async (to, _t, link) => (mails.push(`enviado|${to}|${link}`), { sent: true }),
      reminder: async (to) => (mails.push(`recordatorio|${to}`), { sent: true }),
    },
    link: (id) => `https://www.erasesuvez.com/crear?b=${id}`,
    trackLink: (id) => `https://www.erasesuvez.com/seguimiento/${id}`,
    now: () => clock,
  };
  const s = await startPrint(store, bookId, "gelato");
  assert.ok(s.ok, JSON.stringify(s));
  const done = await completePrint(store, s.orderId, deps);
  assert.ok(done.ok, JSON.stringify(done));
  return {
    store,
    bookId,
    orderId: s.orderId,
    deps,
    mails,
    orders,
    setGelato: (g: Partial<GelatoOrder>) => (gelato = { ...gelato, ...g }),
    setNow: (d: Date) => (clock = d),
  };
}

test("envío: económico por defecto, cambiable por variable y nunca un valor raro", () => {
  assert.equal(gelatoShipmentMethod({}), "normal");
  assert.equal(gelatoShipmentMethod({ GELATO_SHIPMENT_METHOD: "express" }), "express");
  assert.equal(gelatoShipmentMethod({ GELATO_SHIPMENT_METHOD: "normal,express" }), "normal,express");
  assert.equal(gelatoShipmentMethod({ GELATO_SHIPMENT_METHOD: "x y<script>" }), "normal");
  const s = cleanShipping(ADDRESS);
  assert.ok(s.ok);
  const body = gelatoOrderBody({ orderReferenceId: "o", customerReferenceId: "b", productUid: "p", pageCount: 30, fileUrl: "https://f/x.pdf", shipping: s.shipping, email, orderType: "order", shipmentMethodUid: "normal" });
  assert.equal(body.shipmentMethodUid, "normal");
});

test("Gelato: se leen el método, la entrega estimada y el número; lo que no es válido se descarta", () => {
  const g = parseOrder({
    id: "g1",
    fulfillmentStatus: "shipped",
    shipment: {
      shipmentMethodName: "Correos Express",
      minDeliveryDate: "2026-10-29",
      maxDeliveryDate: "2026-10-31T00:00:00Z",
      packages: [{ trackingCode: "PQ4B7C0012345670128001X", trackingUrl: "https://s.correos.es/x" }],
    },
  });
  assert.deepEqual(g, { id: "g1", status: "shipped", orderReferenceId: null, trackingUrl: "https://s.correos.es/x", trackingCode: "PQ4B7C0012345670128001X", method: "Correos Express", etaFrom: "2026-10-29", etaTo: "2026-10-31" });
  const bad = parseOrder({ id: "g2", shipment: { minDeliveryDate: "pronto", packages: [{ trackingCode: "<b>x</b>", trackingUrl: "http://inseguro" }] } })!;
  assert.equal(bad.trackingCode, null);
  assert.equal(bad.trackingUrl, null);
  assert.equal(bad.etaFrom, null);
});

test("fechas: día y mes en Madrid, y la entrega estimada en una frase", () => {
  assert.equal(dayLabel("2026-10-24T22:30:00Z"), "25 de octubre", "medianoche pasada en Madrid");
  assert.equal(dayLabel(null), null);
  assert.equal(etaLabel("2026-10-29", "2026-10-31"), "entre el 29 y el 31 de octubre");
  assert.equal(etaLabel("2026-10-30", "2026-11-02"), "entre el 30 de octubre y el 2 de noviembre");
  assert.equal(etaLabel("2026-10-29", "2026-10-29"), "el 29 de octubre");
  assert.equal(etaLabel(null, "2026-11-03"), "el 3 de noviembre");
  assert.equal(etaLabel(null, null), null);
});

test("hitos: hechos, el actual y los que faltan; «Entregado» cierra", () => {
  const info = { steps: { sent: "2026-10-24T20:17:00Z", shipped: "2026-10-28T15:00:00Z" } };
  const s = trackSteps("shipped", "2026-10-24T14:40:00Z", null, info);
  assert.deepEqual(s.map((x) => [x.key, x.state, x.date]), [
    ["paid", "done", "24 de octubre"],
    ["sent", "done", "24 de octubre"],
    ["in_production", "done", null],
    ["shipped", "current", "28 de octubre"],
    ["delivered", "todo", null],
  ]);
  assert.equal(trackSteps("delivered", "2026-10-24T14:40:00Z", null, {}).every((x) => x.state === "done"), true);
  assert.equal(trackSteps("sent", "2026-10-24T14:40:00Z", "2026-10-24T20:17:00Z", {})[1].date, "24 de octubre", "sin hito guardado, la fecha de envío");
});

test("mergeInfo: solo cambia si hay algo nuevo y cada hito se fecha una vez", () => {
  const now = new Date("2026-10-26T08:00:00Z");
  const a = mergeInfo(null, { ...GEL0, status: "printed" }, "in_production", now)!;
  assert.deepEqual(a, { steps: { in_production: now.toISOString() } });
  assert.equal(mergeInfo(a, { ...GEL0 }, null, new Date()), null, "nada nuevo");
  assert.equal(mergeInfo(a, { ...GEL0 }, "in_production", new Date()), null, "el hito ya tenía fecha");
  const b = mergeInfo(a, { ...GEL0, etaFrom: "2026-10-29", etaTo: "2026-10-31", method: "Estándar" }, null, new Date())!;
  assert.equal(b.etaTo, "2026-10-31");
  assert.equal(b.steps?.in_production, now.toISOString());
});

test("recorrido: el pedido pide el económico, el email lleva a nuestra página y la página cuenta cómo va", async () => {
  const t0 = new Date("2026-10-24T20:17:00Z");
  const { store, bookId, orderId, deps, mails, orders, setGelato, setNow } = await sentBook(t0);
  assert.equal(orders[0].shipmentMethodUid, "normal");
  assert.deepEqual(mails, [`imprenta|${email}|https://www.erasesuvez.com/seguimiento/${orderId}`]);
  const bv = await bookView(store, bookId);
  assert.ok(bv.ok && bv.print?.trackPath === `/seguimiento/${orderId}`, "el panel del libro enlaza la página");

  // recién enviado: no se pregunta a la imprenta (aún no ha pasado media hora)
  let v = await trackingView(store, orderId, deps);
  assert.ok(v.ok);
  assert.equal(v.status, "sent");
  assert.equal(v.title, plan.title);
  assert.equal(v.city, "Madrid");
  assert.equal(v.info.steps?.sent, t0.toISOString());
  assert.equal(v.coverUrl, null, "en memoria las imágenes no tienen URL; en Supabase va la portada firmada");
  assert.ok(!JSON.stringify(v).includes("Calle Mayor"), "sin la dirección completa");
  assert.ok(!JSON.stringify(v).includes(bookId), "sin el enlace al libro");

  // una hora después, en producción en la imprenta y con fecha estimada: al abrir la página se actualiza
  setGelato({ status: "printed", etaFrom: "2026-10-29", etaTo: "2026-10-31", method: "Envío estándar" });
  setNow(new Date("2026-10-25T09:00:00Z"));
  v = await trackingView(store, orderId, deps);
  assert.ok(v.ok);
  assert.equal(v.status, "in_production");
  assert.equal(v.info.etaFrom, "2026-10-29");
  assert.equal(v.info.steps?.in_production, "2026-10-25T09:00:00.000Z");

  // sale: email de envío (a nuestra página) con el número de seguimiento
  setGelato({ status: "shipped", trackingCode: "PQ4B7C0012345670128001X", trackingUrl: "https://s.correos.es/x" });
  setNow(new Date("2026-10-28T15:00:00Z"));
  assert.equal(await refreshPrint(store, (await store.getOrderById(orderId))!, deps), "updated");
  assert.deepEqual(mails.filter((m) => m.startsWith("enviado")), [`enviado|${email}|https://www.erasesuvez.com/seguimiento/${orderId}`]);
  v = await trackingView(store, orderId, deps);
  assert.ok(v.ok && v.status === "shipped" && v.info.trackingCode === "PQ4B7C0012345670128001X" && v.trackingUrl === "https://s.correos.es/x");
});

test("página: id raro o pedido que no es de tapa dura, 404", async () => {
  const store = memoryStore(newMemoryState());
  for (const id of ["", "ejemplo", "../crear", "123", null, "00000000-0000-4000-8000-000000000000"]) {
    const r = await trackingView(store, id);
    assert.ok(!r.ok && r.status === 404, String(id));
  }
});

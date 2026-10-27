/**
 * Un pedido, un libro impreso (auditoría 26 oct, I4): si Gelato acepta el pedido y después falla algo nuestro, o la
 * función se corta, el reintento y el cron no crean otro. Sin red: Gelato de mentira que guarda lo que se le pide.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState, type GenStore } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { payDryRun, pendingPageJobs, requestPages, startBook } from "../../lib/book/service";
import { completePrint, printCron, startPrint, type PrintDeps } from "../../lib/book/print";
import { estimatedCover, findGelatoOrders, type GelatoOrder } from "../../lib/print/gelato";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" };

/** Libro de tapa dura pagado, con las doce páginas y sus imágenes firmadas (a la imprenta de verdad no van huecos). */
async function readyBook() {
  const plain = memoryStore(newMemoryState());
  const store: GenStore = { ...plain, signedUrl: async (p: string) => `https://files.example/${p}` };
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  await payDryRun(store, { bookId: start.bookId, edition: "hardcover", shipping: ADDRESS });
  assert.ok((await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM)).ok);
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, start.bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
  for (const j of await store.listJobs((await store.findBook({ publicId: start.bookId }))!.id)) if (j.status === "done") await store.updateJob(j.id, { storage_path: `books/x/${j.id}.png` });
  return { store, bookId: start.bookId };
}

/** Gelato de mentira: guarda los pedidos creados y los encuentra por nuestra referencia. */
function gelato(now = () => new Date()) {
  const orders: GelatoOrder[] = [];
  const mails: string[] = [];
  let searchFails = false;
  const deps: PrintDeps = {
    mode: "gelato",
    orderType: "draft",
    pageCount: 30,
    resolveProductUid: async () => "photobooks-hardcover_x",
    productSize: async () => ({ trimWidth: 280, trimHeight: 210, bleed: 4 }),
    coverGeometry: async () => estimatedCover(),
    estimatedCover,
    render: async () => new Uint8Array([37, 80, 68, 70]),
    createOrder: async (i) => {
      const o: GelatoOrder = { id: `gel-${orders.length + 1}-abcdef`, status: "created", orderReferenceId: i.orderReferenceId, trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null };
      orders.push(o);
      return o;
    },
    getOrder: async (id) => orders.find((o) => o.id === id) ?? null,
    findOrders: async (ref) => (searchFails ? { error: "gelato_busqueda_503" } : orders.filter((o) => o.orderReferenceId === ref)),
    mail: {
      sentToPrint: async (to) => (mails.push(`imprenta|${to}`), { sent: true }),
      shipped: async () => ({ sent: true }),
      reminder: async () => ({ sent: true }),
    },
    link: (id) => `https://www.erasesuvez.com/crear?b=${id}`,
    trackLink: (id) => `https://www.erasesuvez.com/seguimiento/${id}`,
    now,
  };
  return { deps, orders, mails, failSearch: (v: boolean) => (searchFails = v) };
}

test("la búsqueda en Gelato pide nuestra referencia y solo devuelve sus pedidos", async () => {
  let body: Record<string, unknown> = {};
  let url = "";
  const f = (async (u: string | URL | Request, init?: RequestInit) => {
    url = String(u);
    body = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ orders: [{ id: "gel-a", orderReferenceId: "ref-1", fulfillmentStatus: "failed" }, { id: "gel-b", orderReferenceId: "ref-1", fulfillmentStatus: "printed" }, { id: "gel-c", orderReferenceId: "otra", fulfillmentStatus: "created" }] }), { status: 200 });
  }) as typeof fetch;
  const r = await findGelatoOrders("ref-1", { GELATO_API_KEY: "k" }, f);
  assert.equal(url, "https://order.gelatoapis.com/v4/orders:search");
  assert.deepEqual(body.orderReferenceIds, ["ref-1"]);
  assert.ok(Array.isArray(r) && r.map((o) => o.id).join() === "gel-a,gel-b");
  const down = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
  assert.ok("error" in (await findGelatoOrders("ref-1", { GELATO_API_KEY: "k" }, down)));
});

test("Gelato acepta y falla al guardar el estado: no se marca fallido, y el cron lo da por enviado sin crear otro", async () => {
  const { store, bookId } = await readyBook();
  let now = new Date();
  const g = gelato(() => now);
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok, JSON.stringify(s));
  // la escritura de `sent` falla (la base, un momento): Gelato ya tiene el pedido
  const broken: GenStore = {
    ...store,
    updateOrder: async (id, patch) => {
      if (patch.printStatus === "sent") throw new Error("orders: timeout");
      return store.updateOrder(id, patch);
    },
  };
  const r = await completePrint(broken, s.orderId, g.deps);
  assert.equal((r as { error?: string }).error, "print_saved_partially");
  const mid = (await store.getOrderById(s.orderId))!;
  assert.equal(mid.printStatus, "sending", "no queda «fallido»: el padre no lo reintentaría");
  assert.equal(mid.printOrderId, "gel-1-abcdef", "el id de la imprenta se guarda nada más tenerlo");

  now = new Date(Date.now() + 20 * 60_000);
  const rep = await printCron(store, g.deps);
  assert.equal(rep.reconciled, 1);
  assert.equal(rep.unstuck, 0);
  const done = (await store.getOrderById(s.orderId))!;
  assert.equal(done.printStatus, "sent");
  assert.equal(g.orders.length, 1, "un solo pedido en la imprenta");
  assert.deepEqual(g.mails, ["imprenta|vera@example.com"]);
});

test("un reintento tras un fallo reutiliza el pedido que Gelato ya tenía; si Gelato lo dio por fallido, crea otro", async () => {
  const { store, bookId } = await readyBook();
  const g = gelato();
  // un intento anterior que llegó a Gelato pero quedó «fallido» en nuestra base
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  g.orders.push({ id: "gel-viejo-123", status: "created", orderReferenceId: s.orderId, trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null });
  assert.ok((await completePrint(store, s.orderId, g.deps)).ok);
  assert.equal((await store.getOrderById(s.orderId))!.printOrderId, "gel-viejo-123");
  assert.equal(g.orders.length, 1);

  // la imprenta lo da por fallido y el padre lo vuelve a mandar: ese sí es un pedido nuevo
  g.orders[0].status = "failed";
  await store.updateOrder(s.orderId, { printStatus: "failed" });
  const again = await startPrint(store, bookId, "gelato", {});
  assert.ok(again.ok);
  assert.ok((await completePrint(store, again.orderId, g.deps)).ok);
  assert.equal(g.orders.length, 2);
  assert.equal((await store.getOrderById(s.orderId))!.printOrderId, "gel-2-abcdef");
});

test("si no se puede preguntar a Gelato, no se crea nada: ni al mandar ni el cron libera el envío", async () => {
  const { store, bookId } = await readyBook();
  let now = new Date();
  const g = gelato(() => now);
  g.failSearch(true);
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  const r = await completePrint(store, s.orderId, g.deps);
  assert.ok(!r.ok);
  assert.equal(g.orders.length, 0);
  const o = (await store.getOrderById(s.orderId))!;
  assert.equal(o.printStatus, "failed");
  assert.match(o.printError ?? "", /^gelato_busqueda_503/);

  // un envío cortado: con la búsqueda caída se espera; sin pedido en Gelato, se libera para reintentar
  const again = await startPrint(store, bookId, "gelato", {});
  assert.ok(again.ok);
  now = new Date(Date.now() + 20 * 60_000);
  assert.equal((await printCron(store, g.deps)).unstuck, 0);
  assert.equal((await store.getOrderById(s.orderId))!.printStatus, "sending");
  g.failSearch(false);
  assert.equal((await printCron(store, g.deps)).unstuck, 1);
  assert.equal((await store.getOrderById(s.orderId))!.printStatus, "failed");
});

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
import { pendingPageJobs, requestPages, startBook } from "../../lib/book/service";
import { completePrint, handlePrintWebhook, printCron, startPrint, uncertainPrintError, type PrintDeps } from "../../lib/book/print";
import { estimatedCover, findGelatoOrders, type GelatoOrder } from "../../lib/print/gelato";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { payApproved } from "./pagar";

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
  await payApproved(store, { bookId: start.bookId, edition: "hardcover", shipping: ADDRESS });
  assert.ok((await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM)).ok);
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, start.bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
  for (const j of await store.listJobs((await store.findBook({ publicId: start.bookId }))!.id)) if (j.status === "done") await store.updateJob(j.id, { storage_path: `books/x/${j.id}.png` });
  return { store, bookId: start.bookId };
}

/** Gelato de mentira: guarda los pedidos creados y los encuentra por nuestra referencia. */
function gelato(now = () => new Date()) {
  const orders: GelatoOrder[] = [];
  const mails: string[] = [];
  const notices: string[] = [];
  let renders = 0;
  let searchFails = false;
  /** El siguiente pedido se crea en Gelato, pero la respuesta no llega (`gelato_0: red`). */
  let loseNextReply = false;
  const deps: PrintDeps = {
    mode: "gelato",
    orderType: "draft",
    pageCount: 30,
    resolveProductUid: async () => "photobooks-hardcover_x",
    productSize: async () => ({ trimWidth: 280, trimHeight: 210, bleed: 4 }),
    coverGeometry: async () => estimatedCover(),
    estimatedCover,
    render: async () => (renders++, new Uint8Array([37, 80, 68, 70])),
    createOrder: async (i) => {
      const o: GelatoOrder = { id: `gel-${orders.length + 1}-abcdef`, status: "created", orderReferenceId: i.orderReferenceId, trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null };
      orders.push(o);
      if (loseNextReply) {
        loseNextReply = false;
        return { error: "gelato_0: red" };
      }
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
    notify: async (subject, text) => (notices.push(`${subject}|${text}`), { sent: true }),
    now,
  };
  return { deps, orders, mails, notices, renders: () => renders, failSearch: (v: boolean) => (searchFails = v), loseReply: () => (loseNextReply = true) };
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

test("revisión: un reintento que se corta tras un envío anterior lo ve el cron (sin la fecha de salida vieja)", async () => {
  const { store, bookId } = await readyBook();
  let now = new Date();
  const g = gelato(() => now);
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  assert.ok((await completePrint(store, s.orderId, g.deps)).ok);
  assert.ok((await store.getOrderById(s.orderId))!.sentAt, "salió una vez");
  // Gelato lo da por fallido, el padre reintenta y la función se corta antes de crear nada
  g.orders[0].status = "failed";
  await store.updateOrder(s.orderId, { printStatus: "failed" });
  const again = await startPrint(store, bookId, "gelato", {});
  assert.ok(again.ok);
  assert.equal((await store.getOrderById(s.orderId))!.sentAt, null, "el reintento empieza sin la salida anterior");
  now = new Date(Date.now() + 20 * 60_000);
  const rep = await printCron(store, g.deps);
  assert.equal(rep.unstuck, 1, "el cron lo libera y avisa");
  assert.equal((await store.getOrderById(s.orderId))!.printStatus, "failed");
});

test("revisión: sin respuesta de Gelato al crear, el pedido se queda «mandándose» (sin cambiar la dirección) y el cron lo encuentra", async () => {
  const { store, bookId } = await readyBook();
  let now = new Date();
  const g = gelato(() => now);
  assert.equal(uncertainPrintError("gelato_0: red"), true);
  assert.equal(uncertainPrintError("gelato_503: x"), true);
  assert.equal(uncertainPrintError("gelato_respuesta"), true);
  assert.equal(uncertainPrintError("gelato_400: dirección"), false);
  assert.equal(uncertainPrintError("gelato_0: sin_clave"), false);
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  g.loseReply();
  const r = await completePrint(store, s.orderId, g.deps);
  assert.equal((r as { error?: string }).error, "print_uncertain");
  const mid = (await store.getOrderById(s.orderId))!;
  assert.equal(mid.printStatus, "sending", "no «fallido»: así no se reintenta con otra dirección");
  assert.match(g.notices.join("\n"), /^Tapa dura sin saber si llegó a la imprenta/m);
  // el padre no puede reenviarlo mientras tanto
  assert.equal((await startPrint(store, bookId, "gelato", {}) as { error?: string }).error, "already_sent");
  now = new Date(Date.now() + 20 * 60_000);
  const rep = await printCron(store, g.deps);
  assert.equal(rep.reconciled, 1);
  assert.equal((await store.getOrderById(s.orderId))!.printStatus, "sent");
  assert.equal(g.orders.length, 1, "un solo libro");
});

test("revisión: el aviso de Gelato de un pedido que quedó «mandándose» lo da por enviado con su fecha y su email", async () => {
  const { store, bookId } = await readyBook();
  const g = gelato();
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  const broken: GenStore = {
    ...store,
    updateOrder: async (id, patch) => {
      if (patch.printStatus === "sent") throw new Error("orders: timeout");
      return store.updateOrder(id, patch);
    },
  };
  assert.equal(((await completePrint(broken, s.orderId, g.deps)) as { error?: string }).error, "print_saved_partially");
  assert.match(g.notices.join("\n"), /sin guardar el estado/, "soporte lo sabe sin esperar al cron");
  g.orders[0].status = "passed";
  assert.equal(await handlePrintWebhook(store, { orderReferenceId: s.orderId, orderId: "gel-1-abcdef" }, g.deps), "updated");
  const o = (await store.getOrderById(s.orderId))!;
  assert.equal(o.printStatus, "sent");
  assert.ok(o.sentAt, "con su fecha: la página enseña el seguimiento");
  assert.deepEqual(g.mails, ["imprenta|vera@example.com"]);
});

test("revisión: si el pedido ya estaba en Gelato, no se vuelve a maquetar; se mira primero por el id guardado y soporte lo sabe", async () => {
  const { store, bookId } = await readyBook();
  const g = gelato();
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  g.orders.push({ id: "gel-guardado-1", status: "created", orderReferenceId: "otra-referencia", trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null });
  await store.updateOrder(s.orderId, { printOrderId: "gel-guardado-1" });
  const r = await completePrint(store, s.orderId, g.deps);
  assert.ok(r.ok && r.printOrderId === "gel-guardado-1", JSON.stringify(r));
  assert.equal(g.renders(), 0, "ni Chromium ni PDF que nadie usa");
  assert.match(g.notices.join("\n"), /^Tapa dura que ya estaba en la imprenta[^]*dirección/m);
});

test("revisión: dos pedidos vivos en Gelato para el mismo libro se avisan", async () => {
  const { store, bookId } = await readyBook();
  const g = gelato();
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  for (const id of ["gel-a-123456", "gel-b-123456"]) g.orders.push({ id, status: "created", orderReferenceId: s.orderId, trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null });
  assert.ok((await completePrint(store, s.orderId, g.deps)).ok);
  assert.match(g.notices.join("\n"), /^Dos pedidos en la imprenta/m);
});

test("revisión: al mandarlo a imprimir, el libro se guarda 30 días más (para reimprimirlo si llega dañado)", async () => {
  const { store, bookId } = await readyBook();
  const now = new Date(Date.now() + 25 * 24 * 3600 * 1000);
  const g = gelato(() => now);
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  assert.ok((await completePrint(store, s.orderId, g.deps)).ok);
  const book = (await store.findBook({ publicId: bookId }))!;
  assert.ok(Date.parse(book.expiresAt!) >= now.getTime() + 29 * 24 * 3600 * 1000, book.expiresAt!);
});

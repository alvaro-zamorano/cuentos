/**
 * Plazos internos por debajo del de la ruta (menores de la auditoría 26 oct). Con muchos pedidos abiertos, las consultas
 * a Gelato del cron de la imprenta no cabían y Vercel lo cortaba a medias.
 */
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { PRINT_CRON_SLOWEST_MS, printCron, printCronDeadline, type PrintDeps } from "../../lib/book/print";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { paintAll } from "../../lib/book/background";
import { pendingPageJobs, prepareCheckout, recordStripePayment, requestPages, startBook } from "../../lib/book/service";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { approveLast } from "./pagar";

const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid", country: "ES" as const };

async function openOrders(n: number) {
  const store = memoryStore(newMemoryState());
  for (let i = 0; i < n; i++) {
    await store.addPaidOrder(`libro-${i}`, { edition: "hardcover", amountCents: 3490, sessionId: `cs_test_${i}`, shipping: ADDRESS, printStatus: "awaiting_approval" });
    const o = (await store.getOrder(`libro-${i}`))!;
    await store.updateOrder(o.id, { printStatus: "sent", printOrderId: `gel-${i}`, sentAt: new Date().toISOString() });
  }
  return store;
}

function deps(ask: () => void): PrintDeps {
  return {
    mode: "gelato",
    getOrder: async (id: string) => (ask(), { id, status: "printed", orderReferenceId: "x", trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null }),
    findOrders: async () => [],
    mail: { sentToPrint: async () => ({ sent: true }), shipped: async () => ({ sent: true }), reminder: async () => ({ sent: true }) },
    link: (id: string) => `https://x/crear?b=${id}`,
    trackLink: (id: string) => `https://x/seguimiento/${id}`,
    notify: async () => ({ sent: true }),
    env: {},
  } as unknown as PrintDeps;
}

test("cron de la imprenta: pasado su plazo deja de preguntar a la imprenta y dice que queda trabajo", async () => {
  const store = await openOrders(3);
  let asked = 0;
  const done = await printCron(store, deps(() => asked++), { deadline: Date.now() - 1 });
  assert.equal(done.remaining, true);
  assert.equal(asked, 0, "con el plazo vencido no empieza ninguna consulta");
  // con tiempo, las hace todas
  const all = await printCron(store, deps(() => asked++), { deadline: Date.now() + 30_000 });
  assert.equal(all.remaining, false);
  assert.equal(asked, 3);
  // sin plazo, como antes
  assert.equal((await printCron(store, deps(() => asked++))).remaining, false);
});

test("cron de la imprenta: el plazo interno deja el hueco del pedido más lento antes de que Vercel corte la ruta", () => {
  // una consulta a Gelato (25 s) y dos emails (15 s cada uno)
  assert.ok(PRINT_CRON_SLOWEST_MS >= 25_000 + 2 * 15_000);
  // la ruta importa cosas solo de servidor: se lee su maxDuration del código
  const maxDuration = Number(/export const maxDuration = (\d+);/.exec(readFileSync(join(__dirname, "../../app/api/cron/print/route.ts"), "utf8"))?.[1]);
  const t0 = 1_000_000;
  assert.equal(printCronDeadline(t0, maxDuration) + PRINT_CRON_SLOWEST_MS, t0 + maxDuration * 1000);
  assert.ok(printCronDeadline(t0, maxDuration) - t0 >= 120_000, "y queda tiempo de trabajo de verdad");
});

/** Un libro con sus páginas pintadas y su tapa dura pagada (pago de prueba, en la preview), esperando a que lo manden. */
async function hardcoverBook(store: ReturnType<typeof memoryStore>, sessionId: string) {
  const ficha = normalizeFicha(EVAL_CASES[0]);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan: mockPlan(ficha), planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  await approveLast(store, start.bookId);
  assert.ok((await prepareCheckout(store, { bookId: start.bookId, edition: "hardcover", shipping: ADDRESS })).ok);
  const event = { type: "checkout.session.completed", data: { object: { id: sessionId, payment_status: "paid", amount_total: 3490, metadata: { bookId: start.bookId, edition: "hardcover" } } } };
  assert.equal((await recordStripePayment(store, event, PREVIEW)).action, "paid");
  assert.ok((await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false, env: PREVIEW }, MOCK_LLM)).ok);
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, start.bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
  return start.bookId;
}
const PREVIEW = { VERCEL_ENV: "preview" };

test("cron de la imprenta: un envío atascado va antes que los recordatorios cuando no da tiempo a todo", async () => {
  const store = memoryStore(newMemoryState());
  await hardcoverBook(store, "cs_test_recordar");
  const stuckBook = await hardcoverBook(store, "cs_test_atascado");
  const stuck = (await store.getOrder((await store.findBook({ publicId: stuckBook }))!.id))!;
  await store.updateOrder(stuck.id, { printStatus: "sending" });
  let clock = Date.now();
  const time = mock.method(Date, "now", () => clock);
  try {
    const later = new Date(clock + 49 * 3_600_000);
    const reminders: string[] = [];
    const d = {
      ...deps(() => undefined),
      findOrders: async () => ((clock += 120_000), []),
      mail: { sentToPrint: async () => ({ sent: true }), shipped: async () => ({ sent: true }), reminder: async (to: string) => (reminders.push(to), { sent: true }) },
      now: () => later,
      env: PREVIEW,
    } as PrintDeps;
    // la consulta a la imprenta del atascado se come el tiempo que quedaba
    const r = await printCron(store, d, { deadline: clock + 60_000 });
    assert.equal(r.unstuck, 1, "el atascado se libera");
    assert.equal(r.reminded, 0);
    assert.deepEqual(reminders, []);
    assert.equal(r.remaining, true, "el recordatorio, en la próxima pasada");
  } finally {
    time.mock.restore();
  }
});

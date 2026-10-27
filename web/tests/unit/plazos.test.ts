/**
 * Plazos internos por debajo del de la ruta (menores de la auditoría 26 oct). El cron de la imprenta tiene 60 s: con
 * muchos pedidos abiertos, las consultas a Gelato no cabían y Vercel lo cortaba a medias.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { printCron, type PrintDeps } from "../../lib/book/print";

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

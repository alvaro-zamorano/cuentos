/**
 * Una tapa dura pagada sin mandar a imprimir no tiene plazo (Álvaro, 26 oct; auditoría B3): el cron de la imprenta
 * alarga el libro cuando se acerca a su fecha, así que el enlace sigue abriéndose hasta que se manda. Sin red.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, prepareCheckout, recordStripePayment, startBook } from "../../lib/book/service";
import { printCron, type PrintDeps } from "../../lib/book/print";
import { estimatedCover } from "../../lib/print/gelato";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { approveLast } from "./pagar";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const DAY = 24 * 3600 * 1000;
const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" };

async function hardcover(edition: "hardcover" | "illustrated", session: string) {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  await approveLast(store, start.bookId);
  assert.ok((await prepareCheckout(store, { bookId: start.bookId, edition, ...(edition === "hardcover" ? { shipping: ADDRESS } : {}) })).ok);
  const amount = edition === "hardcover" ? 3490 : 1490;
  const ev = { type: "checkout.session.completed", data: { object: { id: session, payment_status: "paid", amount_total: amount, metadata: { bookId: start.bookId, edition } } } };
  assert.equal((await recordStripePayment(store, ev)).action, "paid");
  return { state, store, bookId: start.bookId };
}

function deps(now: Date, env: Record<string, string | undefined> = {}): PrintDeps {
  return {
    mode: "dry-run",
    orderType: "draft",
    pageCount: 30,
    resolveProductUid: async () => "photobooks-hardcover_x",
    productSize: async () => ({ trimWidth: 280, trimHeight: 210, bleed: 4 }),
    coverGeometry: async () => estimatedCover(),
    estimatedCover,
    render: async () => new Uint8Array([37, 80, 68, 70]),
    createOrder: async () => ({ error: "no se usa" }),
    getOrder: async () => null,
    mail: { sentToPrint: async () => ({ sent: true }), shipped: async () => ({ sent: true }), reminder: async () => ({ sent: true }) },
    link: (id) => `https://www.erasesuvez.com/crear?b=${id}`,
    trackLink: (id) => `https://www.erasesuvez.com/seguimiento/${id}`,
    now: () => now,
    env,
  };
}

test("tapa dura sin mandar a imprimir: cerca de su fecha, el cron alarga el libro y el enlace sigue abriéndose", async () => {
  const { state, store, bookId } = await hardcover("hardcover", "cs_test_hc1");
  // le quedan 2 días
  state.books.get(bookId)!.expiresAt = new Date(Date.now() + 2 * DAY).toISOString();
  const r = await printCron(store, deps(new Date()));
  assert.equal(r.kept, 1);
  const left = Date.parse(state.books.get(bookId)!.expiresAt!) - Date.now();
  assert.ok(left > 29 * DAY, `quedan ${(left / DAY).toFixed(1)} días`);
  // aunque ya hubiera pasado la fecha (el borrado la conservaba), vuelve a abrirse
  state.books.get(bookId)!.expiresAt = new Date(Date.now() - DAY).toISOString();
  assert.equal(((await bookView(store, bookId)) as { error?: string }).error, "not_found");
  await printCron(store, deps(new Date()));
  assert.ok((await bookView(store, bookId)).ok);
});

test("no toca lo que no hace falta: lejos de su fecha, el PDF y los pedidos de otro entorno", async () => {
  const far = await hardcover("hardcover", "cs_test_hc2");
  const before = far.state.books.get(far.bookId)!.expiresAt;
  assert.equal((await printCron(far.store, deps(new Date()))).kept, 0, "le quedan 30 días");
  assert.equal(far.state.books.get(far.bookId)!.expiresAt, before);

  const pdf = await hardcover("illustrated", "cs_test_pdf");
  pdf.state.books.get(pdf.bookId)!.expiresAt = new Date(Date.now() + DAY).toISOString();
  assert.equal((await printCron(pdf.store, deps(new Date()))).kept, 0, "el PDF caduca a los 30 días del pago");

  const test = await hardcover("hardcover", "cs_test_hc3");
  test.state.books.get(test.bookId)!.expiresAt = new Date(Date.now() + DAY).toISOString();
  assert.equal((await printCron(test.store, deps(new Date(), { VERCEL_ENV: "production" }))).kept, 0, "producción no alarga pedidos de prueba");
});

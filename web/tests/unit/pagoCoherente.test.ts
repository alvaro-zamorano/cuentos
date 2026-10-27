/**
 * Lo que se paga es lo que se ve (menores de la auditoría 26 oct): el pedido lleva la dirección de la sesión que se paga,
 * no la última escrita en otra pestaña, y no se paga sin personajes dibujados (los pagados quedan fijados). Sin red:
 * memoria y dry-run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { approveSheet, draftV2, prepareCheckout, rememberCheckoutShipping, recordStripePayment, reviseSheet, startBook, type PaidEvent } from "../../lib/book/service";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const CASA = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" };
const ABUELA = { name: "Carmen López Ruiz", line1: "Avenida del Mar 3", postcode: "07001", city: "Palma" };

async function book({ paint = true } = {}) {
  const store = memoryStore(newMemoryState());
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  if (paint) await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  return { store, start };
}

const paid = (id: string, bookId: string): PaidEvent => ({
  type: "checkout.session.completed",
  data: { object: { id, payment_status: "paid", amount_total: 3490, currency: "eur", metadata: { bookId, edition: "hardcover" } } },
});

test("dos pestañas con dos direcciones: el pedido lleva la de la sesión que se paga, no la última escrita", async () => {
  const { store, start } = await book();
  // pestaña 1: casa; pestaña 2: la abuela. Se paga la 1
  const a = await prepareCheckout(store, { bookId: start.bookId, edition: "hardcover", shipping: CASA });
  assert.ok(a.ok && a.shipping);
  await rememberCheckoutShipping(store, start.bookId, "cs_test_casa", a.shipping);
  const b = await prepareCheckout(store, { bookId: start.bookId, edition: "hardcover", shipping: ABUELA });
  assert.ok(b.ok && b.shipping);
  await rememberCheckoutShipping(store, start.bookId, "cs_test_abuela", b.shipping);
  assert.equal((await recordStripePayment(store, paid("cs_test_casa", start.bookId), {})).action, "paid");
  const uuid = (await store.findBook({ publicId: start.bookId }))!.id;
  assert.equal((await store.getOrder(uuid))?.shipping?.line1, "Calle Mayor 12", "antes ganaba la última abierta: la de la abuela");
  // pagado: las direcciones de las sesiones abiertas ya no se guardan en el libro
  assert.equal(draftV2((await store.findBook({ publicId: start.bookId }))!)?.checkoutShipping, undefined);
});

test("sin la dirección de la sesión apuntada, el pedido usa la última escrita (como antes)", async () => {
  const { store, start } = await book();
  assert.ok((await prepareCheckout(store, { bookId: start.bookId, edition: "hardcover", shipping: ABUELA })).ok);
  assert.equal((await recordStripePayment(store, paid("cs_test_x", start.bookId), {})).action, "paid");
  const uuid = (await store.findBook({ publicId: start.bookId }))!.id;
  assert.equal((await store.getOrder(uuid))?.shipping?.city, "Palma");
});

test("se guardan como mucho las direcciones de las últimas cuatro sesiones", async () => {
  const { store, start } = await book();
  for (let i = 0; i < 6; i++) await rememberCheckoutShipping(store, start.bookId, `cs_test_${i}`, { ...CASA, line1: `Calle ${i}`, country: "ES" });
  const d = draftV2((await store.findBook({ publicId: start.bookId }))!)!;
  assert.deepEqual(Object.keys(d.checkoutShipping ?? {}), ["cs_test_2", "cs_test_3", "cs_test_4", "cs_test_5"]);
});

test("sin personajes dibujados no se abre el pago; con ellos, quedan fijados los que se pagan", async () => {
  const { store, start } = await book({ paint: false });
  const early = await prepareCheckout(store, { bookId: start.bookId, edition: "illustrated" });
  assert.equal((early as { error: string }).error, "cast_not_ready");
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  // sin aprobarlos (un enlace con `pagado=1` salta al paso 5): se fijan los dibujados
  assert.ok((await prepareCheckout(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  assert.equal(draftV2((await store.findBook({ publicId: start.bookId }))!)?.approvedSheetJobId, start.sheetJobId);
});

test("aprobados unos personajes y pedidos otros, se pagan los nuevos en cuanto están dibujados (no los de antes)", async () => {
  const { store, start } = await book();
  assert.ok((await approveSheet(store, { bookId: start.bookId, sheetJobId: start.sheetJobId })).ok);
  const again = await reviseSheet(store, { bookId: start.bookId, instruction: "el pelo más corto" }, dryRunAdapter, MOCK_LLM);
  assert.ok(again.ok && again.sheetJobId, JSON.stringify(again));
  // dibujándose los nuevos, todavía no
  assert.equal(((await prepareCheckout(store, { bookId: start.bookId, edition: "illustrated" })) as { error: string }).error, "sheet_not_ready");
  await paintAll(store, dryRunAdapter, [again.sheetJobId!, again.coverJobId!], { concurrency: 1, deadline: Date.now() + 30_000 });
  assert.ok((await prepareCheckout(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  assert.equal(draftV2((await store.findBook({ publicId: start.bookId }))!)?.approvedSheetJobId, again.sheetJobId);
});

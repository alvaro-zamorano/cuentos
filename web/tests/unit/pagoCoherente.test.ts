/**
 * Lo que se paga es lo que se ve (menores de la auditoría 26 oct): el pedido lleva la dirección de la sesión que se paga,
 * no la última escrita en otra pestaña, no se paga sin personajes aprobados, y las páginas salen con los que estaban
 * aprobados al abrir la sesión que se paga. Sin red: memoria, dry-run y Stripe de mentira con `fetch`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import Module from "node:module";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { approveSheet, draftV2, prepareCheckout, rememberCheckout, recordStripePayment, reviseSheet, startBook, type PaidEvent } from "../../lib/book/service";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const CASA = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" };
const ABUELA = { name: "Carmen López Ruiz", line1: "Avenida del Mar 3", postcode: "07001", city: "Palma" };

async function book({ paint = true, approve = false, store = memoryStore(newMemoryState()) } = {}) {
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  if (paint) await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  if (approve) assert.ok((await approveSheet(store, { bookId: start.bookId, sheetJobId: start.sheetJobId })).ok);
  return { store, start };
}

const paid = (id: string, bookId: string): PaidEvent => ({
  type: "checkout.session.completed",
  data: { object: { id, payment_status: "paid", amount_total: 3490, currency: "eur", metadata: { bookId, edition: "hardcover" } } },
});

test("dos pestañas con dos direcciones: el pedido lleva la de la sesión que se paga, no la última escrita", async () => {
  const { store, start } = await book({ approve: true });
  // pestaña 1: casa; pestaña 2: la abuela. Se paga la 1
  const a = await prepareCheckout(store, { bookId: start.bookId, edition: "hardcover", shipping: CASA });
  assert.ok(a.ok && a.shipping);
  await rememberCheckout(store, start.bookId, "cs_test_casa", a);
  const b = await prepareCheckout(store, { bookId: start.bookId, edition: "hardcover", shipping: ABUELA });
  assert.ok(b.ok && b.shipping);
  await rememberCheckout(store, start.bookId, "cs_test_abuela", b);
  assert.equal((await recordStripePayment(store, paid("cs_test_casa", start.bookId), {})).action, "paid");
  const uuid = (await store.findBook({ publicId: start.bookId }))!.id;
  assert.equal((await store.getOrder(uuid))?.shipping?.line1, "Calle Mayor 12", "antes ganaba la última abierta: la de la abuela");
  // pagado: lo apuntado de las sesiones abiertas ya no se guarda en el libro
  const d = draftV2((await store.findBook({ publicId: start.bookId }))!)!;
  assert.equal(d.checkoutShipping, undefined);
  assert.equal(d.checkoutCast, undefined);
});

test("sin la dirección de la sesión apuntada, el pedido usa la última escrita (como antes)", async () => {
  const { store, start } = await book({ approve: true });
  assert.ok((await prepareCheckout(store, { bookId: start.bookId, edition: "hardcover", shipping: ABUELA })).ok);
  assert.equal((await recordStripePayment(store, paid("cs_test_x", start.bookId), {})).action, "paid");
  const uuid = (await store.findBook({ publicId: start.bookId }))!.id;
  assert.equal((await store.getOrder(uuid))?.shipping?.city, "Palma");
});

test("se guardan como mucho las últimas cuatro sesiones", async () => {
  const { store, start } = await book();
  for (let i = 0; i < 6; i++) await rememberCheckout(store, start.bookId, `cs_test_${i}`, { shipping: { ...CASA, line1: `Calle ${i}`, country: "ES" }, castJobId: start.sheetJobId });
  const d = draftV2((await store.findBook({ publicId: start.bookId }))!)!;
  assert.deepEqual(Object.keys(d.checkoutShipping ?? {}), ["cs_test_2", "cs_test_3", "cs_test_4", "cs_test_5"]);
  assert.deepEqual(Object.keys(d.checkoutCast ?? {}), ["cs_test_2", "cs_test_3", "cs_test_4", "cs_test_5"]);
});

test("sin personajes dibujados no se abre el pago, ni sin aprobarlos", async () => {
  const { store, start } = await book({ paint: false });
  const early = await prepareCheckout(store, { bookId: start.bookId, edition: "illustrated" });
  assert.equal((early as { error: string }).error, "cast_not_ready");
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  // sin aprobarlos (un enlace con `pagado=1` salta al paso 5): el paso 5 lleva al 4
  assert.equal(((await prepareCheckout(store, { bookId: start.bookId, edition: "illustrated" })) as { error: string }).error, "cast_not_approved");
  assert.ok((await approveSheet(store, { bookId: start.bookId, sheetJobId: start.sheetJobId })).ok);
  const ok = await prepareCheckout(store, { bookId: start.bookId, edition: "illustrated" });
  assert.ok(ok.ok && ok.castJobId === start.sheetJobId);
});

test("aprobados unos personajes y pedidos otros en otra pestaña: no se paga hasta aprobar los nuevos", async () => {
  const { store, start } = await book({ approve: true });
  const again = await reviseSheet(store, { bookId: start.bookId, instruction: "el pelo más corto" }, dryRunAdapter, MOCK_LLM);
  assert.ok(again.ok && again.sheetJobId, JSON.stringify(again));
  // dibujándose los nuevos, todavía no
  assert.equal(((await prepareCheckout(store, { bookId: start.bookId, edition: "illustrated" })) as { error: string }).error, "sheet_not_ready");
  await paintAll(store, dryRunAdapter, [again.sheetJobId!, again.coverJobId!], { concurrency: 1, deadline: Date.now() + 30_000 });
  // dibujados, hay que aprobarlos: cambiar los personajes quitó la aprobación de los de antes
  assert.equal(((await prepareCheckout(store, { bookId: start.bookId, edition: "illustrated" })) as { error: string }).error, "cast_not_approved");
  assert.ok((await approveSheet(store, { bookId: start.bookId, sheetJobId: again.sheetJobId! })).ok);
  const ok = await prepareCheckout(store, { bookId: start.bookId, edition: "illustrated" });
  assert.ok(ok.ok && ok.castJobId === again.sheetJobId);
});

test("se paga la sesión abierta con unos personajes y en otra pestaña se aprobaron otros: las páginas salen con los pagados", async () => {
  const { store, start } = await book({ approve: true });
  const a = await prepareCheckout(store, { bookId: start.bookId, edition: "hardcover", shipping: CASA });
  assert.ok(a.ok);
  await rememberCheckout(store, start.bookId, "cs_test_a", a);
  // otra pestaña cambia los personajes y aprueba los nuevos (sin llegar a pagar)
  const again = await reviseSheet(store, { bookId: start.bookId, instruction: "con gafas" }, dryRunAdapter, MOCK_LLM);
  assert.ok(again.ok && again.sheetJobId);
  await paintAll(store, dryRunAdapter, [again.sheetJobId!, again.coverJobId!], { concurrency: 1, deadline: Date.now() + 30_000 });
  assert.ok((await approveSheet(store, { bookId: start.bookId, sheetJobId: again.sheetJobId! })).ok);
  // llega el pago de la primera sesión
  assert.equal((await recordStripePayment(store, paid("cs_test_a", start.bookId), {})).action, "paid");
  assert.equal(draftV2((await store.findBook({ publicId: start.bookId }))!)?.approvedSheetJobId, start.sheetJobId, "antes se pintaban con los otros");
});

// la ruta importa `server-only`, que fuera de Next lanza: aquí, su versión vacía (la que usa Next en el servidor)
const resolver = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolve = resolver._resolveFilename;
const serverOnlyEmpty = require.resolve("server-only").replace(/index\.js$/, "empty.js");
resolver._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolve.call(this, request === "server-only" ? serverOnlyEmpty : request, ...rest);
};

// una IP por petición: el límite de pagos por IP no entra en estas pruebas
let ip = 0;

/** La ruta de pago con Stripe de mentira. `during`: lo que pasa mientras Stripe abre la sesión. */
async function checkoutRoute(during: () => void = () => undefined) {
  const env: Record<string, string | undefined> = { STRIPE_SECRET_KEY: "sk_test_de_mentira", STRIPE_WEBHOOK_SECRET: "whsec_de_mentira", GENERATION_PROVIDER: "dry-run", NEXT_PUBLIC_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined };
  const prev: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const g = globalThis as unknown as { __cuentosGen?: ReturnType<typeof newMemoryState> };
  const prevState = g.__cuentosGen;
  const prevFetch = globalThis.fetch;
  const state = newMemoryState();
  g.__cuentosGen = state;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url !== "https://api.stripe.com/v1/checkout/sessions") throw new Error(`sin red en los tests: ${url}`);
    during();
    return Response.json({ id: "cs_test_ruta", url: "https://checkout.stripe.com/c/pay/cs_test_ruta" });
  }) as typeof fetch;
  try {
    const { store, start } = await book({ approve: true, store: memoryStore(state) });
    const { POST } = await import("../../app/api/libro/checkout/route");
    const res = await POST(new Request("https://www.erasesuvez.com/api/libro/checkout", { method: "POST", headers: { "x-forwarded-for": `10.0.0.${++ip}` }, body: JSON.stringify({ bookId: start.bookId, waiver: true, edition: "illustrated" }) }));
    return { res, store, start, state };
  } finally {
    globalThis.fetch = prevFetch;
    g.__cuentosGen = prevState;
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("ruta de pago: apunta los personajes de la sesión y manda a Stripe", async () => {
  const { res, store, start } = await checkoutRoute();
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { url: string }).url, "https://checkout.stripe.com/c/pay/cs_test_ruta");
  assert.deepEqual(draftV2((await store.findBook({ publicId: start.bookId }))!)?.checkoutCast, { cs_test_ruta: start.sheetJobId });
});

test("ruta de pago: si no se puede apuntar la sesión, 502 y no se manda a pagar", async () => {
  let gone = () => undefined as void;
  const run = checkoutRoute(() => gone());
  // el libro desaparece mientras Stripe abre la sesión: no se puede apuntar
  gone = () => {
    const g = globalThis as unknown as { __cuentosGen?: ReturnType<typeof newMemoryState> };
    g.__cuentosGen?.books.clear();
  };
  const { res } = await run;
  assert.equal(res.status, 502);
  assert.equal(((await res.json()) as { url?: string }).url, undefined);
});

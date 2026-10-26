/**
 * La preview y producción comparten base (auditoría 26 oct, B1). Cada entorno solo cuenta y toca sus pedidos: en
 * producción, un pago de prueba de la preview no existe; en la preview, un pedido real no se manda a la imprenta ni se
 * recuerda por email. Y los crons exigen secreto en cualquier despliegue de Vercel. Sin red: memoria, dry-run y dobles.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, pendingPageJobs, prepareCheckout, recordStripePayment, requestPages, startBook } from "../../lib/book/service";
import { printCron, startPrint, type PrintDeps } from "../../lib/book/print";
import { estimatedCover } from "../../lib/print/gelato";
import { cronAuthorized } from "../../lib/cronAuth";
import { isLiveSession, orderBelongsToEnv, paidInEnv } from "../../lib/stripe";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const email = "vera@example.com";
const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" };
const PROD = { VERCEL_ENV: "production" };
const PREVIEW = { VERCEL_ENV: "preview" };

async function book() {
  const store = memoryStore(newMemoryState());
  const start = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  return { store, bookId: start.bookId };
}

const session = (id: string, bookId: string, edition: "illustrated" | "hardcover", amount: number) => ({
  type: "checkout.session.completed",
  data: { object: { id, payment_status: "paid", amount_total: amount, metadata: { bookId, edition } } },
});

function deps(env: Record<string, string | undefined>, now: Date) {
  const mails: string[] = [];
  const d: PrintDeps = {
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
    mail: {
      sentToPrint: async () => ({ sent: true }),
      shipped: async () => ({ sent: true }),
      reminder: async (to) => (mails.push(`recordatorio|${to}`), { sent: true }),
    },
    link: (id) => `https://www.erasesuvez.com/crear?b=${id}`,
    trackLink: (id) => `https://www.erasesuvez.com/seguimiento/${id}`,
    now: () => now,
    env,
  };
  return { deps: d, mails };
}

test("qué cobro cuenta en cada entorno: en producción, solo cs_live_; fuera, cualquiera", () => {
  assert.equal(isLiveSession("cs_live_a1"), true);
  for (const s of ["cs_test_a1", "dry-run:abc12345", null, undefined, ""]) assert.equal(isLiveSession(s), false, String(s));
  assert.equal(paidInEnv("cs_live_a1", PROD), true);
  assert.equal(paidInEnv("cs_test_a1", PROD), false);
  assert.equal(paidInEnv("dry-run:abc12345", PROD), false);
  assert.equal(paidInEnv("cs_test_a1", PREVIEW), true);
  assert.equal(paidInEnv("dry-run:abc12345", {}), true, "en local, todo");
  // cada entorno toca solo sus pedidos
  assert.equal(orderBelongsToEnv("cs_live_a1", PROD), true);
  assert.equal(orderBelongsToEnv("cs_test_a1", PROD), false);
  assert.equal(orderBelongsToEnv("cs_live_a1", PREVIEW), false, "la preview no toca pedidos reales");
  assert.equal(orderBelongsToEnv("cs_test_a1", PREVIEW), true);
  assert.equal(orderBelongsToEnv("dry-run:abc12345", {}), true);
});

test("producción: un libro pagado con la tarjeta de prueba en la preview no está pagado en www, y el cobro real se registra", async () => {
  const { store, bookId } = await book();
  // pagado en la preview con la tarjeta 4242 (la base es la misma)
  assert.deepEqual(await recordStripePayment(store, session("cs_test_1", bookId, "illustrated", 1490), PREVIEW), { action: "paid", bookId });
  const inPreview = await bookView(store, bookId, PREVIEW);
  assert.ok(inPreview.ok && inPreview.paid && inPreview.edition === "illustrated");

  const inProd = await bookView(store, bookId, PROD);
  assert.ok(inProd.ok);
  assert.equal(inProd.paid, false, "en www no se abre como pagado (ni el PDF ilustrado)");
  assert.equal(inProd.edition, null);
  assert.equal(inProd.print, null);
  const pages = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false, env: PROD }, MOCK_LLM);
  assert.equal((pages as { status: number }).status, 402, "y no se pintan páginas por él");
  assert.ok((await prepareCheckout(store, { bookId, edition: "illustrated" }, PROD)).ok, "se puede comprar de verdad");

  // el cobro real no se toma por duplicado del de prueba (antes se ignoraba: cobro sin pedido)
  assert.deepEqual(await recordStripePayment(store, session("cs_live_1", bookId, "illustrated", 1490), PROD), { action: "paid", bookId });
  const paid = await bookView(store, bookId, PROD);
  assert.ok(paid.ok && paid.paid && paid.edition === "illustrated");
  assert.deepEqual(await recordStripePayment(store, session("cs_live_1", bookId, "illustrated", 1490), PROD), { action: "duplicate", bookId }, "la misma sesión: Stripe reintenta");
  assert.deepEqual(await recordStripePayment(store, session("cs_live_2", bookId, "illustrated", 1490), PROD), { action: "double_charge", bookId }, "otra sesión: cobro doble");
  assert.equal((await prepareCheckout(store, { bookId, edition: "illustrated" }, PROD) as { error: string }).error, "already_paid");
});

test("preview: no manda a la imprenta un pedido real ni le escribe; producción no le escribe a uno de prueba", async () => {
  const { store, bookId } = await book();
  assert.ok((await prepareCheckout(store, { bookId, edition: "hardcover", shipping: ADDRESS })).ok);
  assert.deepEqual(await recordStripePayment(store, session("cs_live_hc", bookId, "hardcover", 3490)), { action: "paid", bookId });
  const r = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok, JSON.stringify(r));
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, bookId), { concurrency: 3, deadline: Date.now() + 30_000 });

  assert.equal((await startPrint(store, bookId, "dry-run", PREVIEW) as { error: string }).error, "live_order");

  const later = new Date(Date.now() + 49 * 3_600_000);
  const preview = deps(PREVIEW, later);
  assert.equal((await printCron(store, preview.deps)).reminded, 0, "la preview no recuerda pedidos reales");
  assert.deepEqual(preview.mails, []);
  const prod = deps(PROD, later);
  assert.equal((await printCron(store, prod.deps)).reminded, 1, "producción sí");
  assert.deepEqual(prod.mails, [`recordatorio|${email}`]);
});

test("producción no recuerda pedidos de prueba", async () => {
  const { store, bookId } = await book();
  assert.ok((await prepareCheckout(store, { bookId, edition: "hardcover", shipping: ADDRESS })).ok);
  assert.deepEqual(await recordStripePayment(store, session("cs_test_hc", bookId, "hardcover", 3490)), { action: "paid", bookId });
  const r = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok, JSON.stringify(r));
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
  const later = new Date(Date.now() + 49 * 3_600_000);
  assert.equal((await printCron(store, deps(PROD, later).deps)).reminded, 0);
  assert.equal((await printCron(store, deps(PREVIEW, later).deps)).reminded, 1, "en la preview, el de prueba sí");
});

test("crons: sin CRON_SECRET solo en local; en Vercel (también la preview) piden secreto, comparado en tiempo constante", () => {
  const req = (auth?: string) => new Request("https://x/api/cron/print", { headers: auth ? { authorization: auth } : {} });
  assert.equal(cronAuthorized(req(), {}), "ok", "en local");
  assert.equal(cronAuthorized(req(), PREVIEW), "missing", "la preview ya no lo deja a cualquiera");
  assert.equal(cronAuthorized(req(), PROD), "missing");
  const env = { ...PREVIEW, CRON_SECRET: "s3cr3to" };
  assert.equal(cronAuthorized(req(), env), "unauthorized");
  assert.equal(cronAuthorized(req("Bearer otro"), env), "unauthorized");
  assert.equal(cronAuthorized(req("Bearer s3cr3to-y-mas"), env), "unauthorized");
  assert.equal(cronAuthorized(req("Bearer s3cr3to"), env), "ok");
  assert.equal(cronAuthorized(req("Bearer s3cr3to"), { ...PROD, CRON_SECRET: " s3cr3to " }), "ok", "el secreto se recorta");
});

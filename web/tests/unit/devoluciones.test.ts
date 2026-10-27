/**
 * Devoluciones y disputas de Stripe (I5) y recibo de compra (I28), auditoría 26 oct. Sin red: memoria, dry-run y una
 * Stripe de mentira que sabe de qué sesión es cada PaymentIntent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, mailReceipt, payDryRun, pendingPageJobs, recordStripePayment, requestPages, startBook, type PaidEvent } from "../../lib/book/service";
import { chargeNotice, DISPUTE_HOLD, recordChargeEvent, type ChargeEvent } from "../../lib/book/refunds";
import { completePrint, printCron, startPrint, type PrintDeps } from "../../lib/book/print";
import { supabasePurgeDb } from "../../lib/purge";
import { estimatedCover } from "../../lib/print/gelato";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { receiptLines, type Receipt } from "../../lib/mail";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const link = (id: string) => `https://www.erasesuvez.com/crear?b=${id}`;
const SHIPPING = { name: "Ana Pérez", line1: "Calle Mayor 1, 3º B", postcode: "28013", city: "Madrid", province: "Madrid", country: "ES" };

async function paidBook(edition: "illustrated" | "hardcover" = "illustrated") {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  const ev: PaidEvent = {
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        payment_status: "paid",
        amount_total: edition === "hardcover" ? 3990 : 1490,
        currency: "eur",
        customer_details: { email: "pago@example.com" },
        metadata: { bookId: start.bookId, edition, withdrawal_waiver_at: "2026-10-26T17:04:00.000Z" },
      },
    },
  };
  if (edition === "hardcover") {
    // la dirección viaja en el borrador hasta que llega el pago
    const b = state.books.get(start.bookId)!;
    (b.raw as { shipping?: unknown }).shipping = SHIPPING;
  }
  const r = await recordStripePayment(store, ev);
  assert.equal(r.action, "paid");
  return { state, store, bookId: start.bookId, ev, r };
}

/** Stripe de mentira: pi_1 es la sesión cs_test_1. */
const stripe = { sessionOf: async (pi: string) => ({ id: pi === "pi_1" ? "cs_test_1" : null }) };
const refund = (over: Partial<ChargeEvent["data"]["object"]> = {}): ChargeEvent => ({
  type: "charge.refunded",
  data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 1490, amount_refunded: 1490, refunded: true, currency: "eur", ...over } },
});
const dispute = (type: string, over: Partial<ChargeEvent["data"]["object"]> = {}): ChargeEvent => ({
  type,
  data: { object: { id: "dp_1", charge: "ch_1", payment_intent: "pi_1", amount: 3990, currency: "eur", reason: "fraudulent", status: "needs_response", evidence_details: { due_by: 1_793_000_000 }, ...over } },
});

test("devolución entera: el libro deja de estar pagado (sin descarga) y soporte lo sabe; la segunda vez no hace nada", async () => {
  const { store, bookId } = await paidBook();
  assert.ok(((await bookView(store, bookId)) as { paid: boolean }).paid);
  const r = await recordChargeEvent(store, refund(), stripe);
  assert.equal(r.action, "refunded");
  assert.ok(r.action === "refunded" && r.print === "none" && r.via === "refund");
  const v = await bookView(store, bookId);
  assert.ok(v.ok && !v.paid, "la descarga del PDF mira `paid`");
  const n = chargeNotice(r, refund())!;
  assert.match(n.subject, /^Devolución: «Vera y la gran idea»/);
  assert.match(n.text, /ya no se descarga ni se manda a imprimir/);
  assert.ok(!n.text.includes(bookId) && !n.text.includes("crear?b="), "sin el enlace ni el id del libro (I30): el pedido basta");
  assert.equal((await recordChargeEvent(store, refund(), stripe)).action, "duplicate");
});

test("devolución parcial: el pedido sigue pagado y solo se avisa", async () => {
  const { store, bookId } = await paidBook();
  const ev = refund({ refunded: false, amount_refunded: 500 });
  const r = await recordChargeEvent(store, ev, stripe);
  assert.equal(r.action, "partial_refund");
  assert.ok(((await bookView(store, bookId)) as { paid: boolean }).paid);
  assert.match(chargeNotice(r, ev)!.text, /Se han devuelto 5,00 € de 14,90 €/);
});

test("devolución de una tapa dura que no ha salido: se cancela y ya no se puede mandar a imprimir", async () => {
  const { store, bookId } = await paidBook("hardcover");
  const r = await recordChargeEvent(store, refund({ amount: 3990, amount_refunded: 3990 }), stripe);
  assert.ok(r.action === "refunded" && r.print === "held");
  const sent = await startPrint(store, bookId, "dry-run");
  assert.ok(!sent.ok, "sin pedido pagado no hay imprenta");
});

test("devolución de una tapa dura que ya está en la imprenta: el aviso pide pararla en Gelato", async () => {
  const { store } = await paidBook("hardcover");
  const order = (await store.getOrderBySession("cs_test_1"))!;
  await store.updateOrder(order.id, { printStatus: "sent", printOrderId: "g_1" });
  const ev = refund({ amount: 3990, amount_refunded: 3990 });
  const r = await recordChargeEvent(store, ev, stripe);
  assert.ok(r.action === "refunded" && r.print === "at_printer");
  assert.match(chargeNotice(r, ev)!.text, /Compruébalo en Gelato y cancélala/);
});

test("disputa: la tapa dura que no ha salido se para con plazo para responder; ganada, vuelve a esperar al padre", async () => {
  const { store, bookId } = await paidBook("hardcover");
  const opened = dispute("charge.dispute.created");
  const r = await recordChargeEvent(store, opened, stripe);
  assert.ok(r.action === "disputed" && r.print === "held");
  let order = (await store.getOrderBySession("cs_test_1"))!;
  assert.equal(order.printStatus, "canceled");
  assert.equal(order.printError, DISPUTE_HOLD);
  assert.ok(((await bookView(store, bookId)) as { paid: boolean }).paid, "la descarga sigue mientras se resuelve");
  const n = chargeNotice(r, opened)!;
  assert.match(n.subject, /^Disputa abierta/);
  assert.match(n.text, /\(fraudulent\).*antes del \d+ de [a-z]+ de 20\d\d/);
  assert.equal((await recordChargeEvent(store, opened, stripe)).action, "duplicate");

  const won = await recordChargeEvent(store, dispute("charge.dispute.closed", { status: "won" }), stripe);
  assert.ok(won.action === "dispute_won" && won.print === "reopened");
  order = (await store.getOrderBySession("cs_test_1"))!;
  assert.equal(order.printStatus, "awaiting_approval");
  assert.equal(order.printError, null);
});

test("disputa perdida: como una devolución entera", async () => {
  const { store, bookId } = await paidBook("hardcover");
  await recordChargeEvent(store, dispute("charge.dispute.created"), stripe);
  const lost = await recordChargeEvent(store, dispute("charge.dispute.closed", { status: "lost" }), stripe);
  assert.ok(lost.action === "refunded" && lost.via === "dispute_lost");
  assert.ok(!((await bookView(store, bookId)) as { paid: boolean }).paid);
  assert.match(chargeNotice(lost, dispute("charge.dispute.closed", { status: "lost" }))!.subject, /^Disputa perdida/);
});

test("devolución que no sabemos de qué pedido es: aviso con lo que trae; si Stripe falla, lanza para que reintente", async () => {
  const { store } = await paidBook();
  const ev = refund({ payment_intent: "pi_otro", metadata: { bookId: "abc" } });
  const r = await recordChargeEvent(store, ev, stripe);
  assert.equal(r.action, "unmatched");
  assert.match(chargeNotice(r, ev)!.text, /pi_otro[^]*abc/);
  const noKey = await recordChargeEvent(store, refund(), { sessionOf: async () => ({ error: "stripe_401" }) });
  assert.ok(noKey.action === "unmatched" && /stripe_401/.test(noKey.reason));
  await assert.rejects(recordChargeEvent(store, refund(), { sessionOf: async () => Promise.reject(new Error("stripe_503")) }), /stripe_503/);
});

test("cada entorno solo toca sus pedidos: la preview no marca un cobro real", async () => {
  const { store, bookId } = await paidBook();
  const live = { sessionOf: async () => ({ id: "cs_live_9" }) };
  await store.addPaidOrder((await store.findBook({ publicId: bookId }))!.id, { amountCents: 1490, edition: "illustrated", sessionId: "cs_live_9" });
  const r = await recordChargeEvent(store, refund(), { ...live, env: { VERCEL_ENV: "preview" } });
  assert.deepEqual(r, { action: "ignored", reason: "otro entorno" });
});

/** PDF pagado y después la mejora a tapa dura: dos pedidos del mismo libro (pi_1 → cs_test_1, pi_2 → cs_up). */
async function upgradedBook() {
  const base = await paidBook();
  (base.state.books.get(base.bookId)!.raw as { shipping?: unknown }).shipping = SHIPPING;
  const up: PaidEvent = {
    type: "checkout.session.completed",
    data: { object: { id: "cs_up", payment_status: "paid", amount_total: 2500, currency: "eur", metadata: { bookId: base.bookId, upgrade: "1", edition: "hardcover" } } },
  };
  const r = await recordStripePayment(base.store, up, {});
  assert.equal(r.action, "upgraded", JSON.stringify(r));
  const both = { sessionOf: async (pi: string) => ({ id: pi === "pi_1" ? "cs_test_1" : pi === "pi_2" ? "cs_up" : null }) };
  return { ...base, both, hardcover: (await base.store.getOrderBySession("cs_up"))! };
}

test("mejora a tapa dura: devuelto el PDF, la tapa dura de la mejora también se para y el aviso lo cuenta bien (revisión 27 oct)", async () => {
  const { store, bookId, both, hardcover } = await upgradedBook();
  assert.equal(hardcover.printStatus, "awaiting_approval");
  const ev = refund();
  const r = await recordChargeEvent(store, ev, both);
  assert.ok(r.action === "refunded" && r.linked?.print === "held" && r.stillPaid, JSON.stringify(r));
  assert.equal((await store.getOrderById(hardcover.id))!.printStatus, "canceled");
  assert.ok(!(await startPrint(store, bookId, "dry-run")).ok, "la tapa dura no sale habiendo cobrado solo la diferencia");
  const text = chargeNotice(r, ev)!.text;
  assert.doesNotMatch(text, /ya no se descarga/);
  assert.match(text, /la mejora a tapa dura \(pedido .*25,00 €\), que sigue pagada\. Su tapa dura no había salido y queda parada/);
});

test("mejora a tapa dura: devuelta la diferencia, la tapa dura se cancela y el PDF se sigue descargando", async () => {
  const { store, bookId, both, hardcover } = await upgradedBook();
  const ev = refund({ payment_intent: "pi_2", amount: 2500, amount_refunded: 2500 });
  const r = await recordChargeEvent(store, ev, both);
  assert.ok(r.action === "refunded" && r.print === "held" && r.stillPaid && r.linked?.edition === "illustrated", JSON.stringify(r));
  assert.equal((await store.getOrderById(hardcover.id))!.status, "refunded");
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.paid && v.edition === "illustrated");
  assert.match(chargeNotice(r, ev)!.text, /El libro se sigue descargando: el PDF está pagado/);
});

test("mejora a tapa dura: una disputa del cobro del PDF para la tapa dura; ganada, vuelve a esperar al padre", async () => {
  const { store, both, hardcover } = await upgradedBook();
  const opened = dispute("charge.dispute.created", { amount: 1490 });
  const r = await recordChargeEvent(store, opened, both);
  assert.ok(r.action === "disputed" && r.print === "none" && r.linked?.print === "held", JSON.stringify(r));
  assert.equal((await store.getOrderById(hardcover.id))!.printError, DISPUTE_HOLD);
  const won = await recordChargeEvent(store, dispute("charge.dispute.closed", { status: "won" }), both);
  assert.ok(won.action === "dispute_won" && won.linked?.print === "reopened", JSON.stringify(won));
  assert.equal((await store.getOrderById(hardcover.id))!.printStatus, "awaiting_approval");
  assert.match(chargeNotice(won, opened)!.text, /La tapa dura de la mejora \(pedido .*\) vuelve a esperar/);
});

test("consulta cerrada después de devolver el cobro: no reabre la tapa dura ni dice «a favor» sin más", async () => {
  const { store } = await paidBook("hardcover");
  await recordChargeEvent(store, dispute("charge.dispute.created", { status: "warning_needs_response" }), stripe);
  await recordChargeEvent(store, refund({ amount: 3990, amount_refunded: 3990 }), stripe);
  const ev = dispute("charge.dispute.closed", { status: "warning_closed" });
  const r = await recordChargeEvent(store, ev, stripe);
  assert.ok(r.action === "dispute_won" && r.print === "already_refunded", JSON.stringify(r));
  const order = (await store.getOrderBySession("cs_test_1"))!;
  assert.equal(order.status, "refunded");
  assert.equal(order.printStatus, "canceled");
  assert.match(chargeNotice(r, ev)!.text, /ya se había devuelto/);
  // un estado que Stripe no manda al cerrar no se toma como ganada
  assert.equal((await recordChargeEvent(store, dispute("charge.dispute.closed", { status: "under_review" }), stripe)).action, "ignored");
});

test("devolver un cobro sin pedido (el cobro doble que devuelve soporte) no manda aviso", async () => {
  const { store } = await paidBook();
  const r = await recordChargeEvent(store, refund({ payment_intent: "pi_doble" }), { sessionOf: async () => ({ id: "cs_doble" }) });
  assert.equal(r.action, "ignored");
  assert.equal(chargeNotice(r, refund()), null);
  // una disputa sin pedido sí: hay que responderla
  const d = await recordChargeEvent(store, dispute("charge.dispute.created", { payment_intent: "pi_doble" }), { sessionOf: async () => ({ id: "cs_doble" }) });
  assert.equal(d.action, "unmatched");
});

test("devuelto el cobro, las ilustraciones de pago dejan de verse; la hoja de personajes, que es gratis, sí", async () => {
  const { store, bookId } = await paidBook();
  const { requestPages } = await import("../../lib/book/service");
  assert.ok((await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false })).ok);
  const all = await store.listJobs((await store.findBook({ publicId: bookId }))!.id);
  const pages = all.filter((j) => j.kind === "page");
  await paintAll(store, dryRunAdapter, pages.map((j) => j.id), { concurrency: 2, deadline: Date.now() + 30_000 });
  // dry-run no guarda archivos ni firma: se les da uno y una firma de mentira
  for (const j of all) await store.updateJob(j.id, { storage_path: `books/x/${j.id}.png` });
  const signing = { ...store, signedUrl: async (path: string) => `signed:${path}` };
  const before = await bookView(signing, bookId);
  const donePages = before.ok ? before.jobs.filter((j) => j.kind === "page" && j.status === "done") : [];
  assert.equal(donePages.length, 12);
  assert.ok(donePages.every((j) => j.url));
  await recordChargeEvent(store, refund(), stripe);
  const after = await bookView(signing, bookId);
  assert.ok(after.ok && !after.paid);
  assert.ok(after.jobs.filter((j) => j.kind === "page").every((j) => j.url === null), "sin pago no se firman las páginas");
  assert.ok(after.jobs.some((j) => j.kind === "sheet" && j.url), "la hoja es gratis");
});

test("recibo (I28): edición, total con IVA, renuncia con su fecha, condiciones y quién vende; una vez por sesión", async () => {
  const { store, bookId, ev, r } = await paidBook("hardcover");
  const sent: { to: string; receipt: Receipt }[] = [];
  const deps = {
    send: async (to: string, receipt: Receipt) => (sent.push({ to, receipt }), { sent: true }),
    link,
    conditionsLink: "https://www.erasesuvez.com/condiciones",
    seller: "Érase su vez",
    contact: "hola@erasesuvez.com",
  };
  assert.deepEqual(await mailReceipt(store, r, ev, deps), { status: "sent" });
  assert.equal(sent[0].to, "pago@example.com", "al email con el que se pagó");
  const { facts, notes } = receiptLines(sent[0].receipt);
  const f = Object.fromEntries(facts);
  assert.equal(f["Pedido"], "Libro de tapa dura con envío a casa, y el PDF");
  assert.equal(f["Total pagado"], "39,90 €, IVA incluido");
  assert.equal(f["Envío a"], "Calle Mayor 1, 3º B, 28013 Madrid, Madrid");
  assert.ok(notes.some((n) => /no puedes desistir de la compra\. Lo aceptaste el 26 de octubre de 2026 a las 18:04 \(hora de Madrid\)/.test(n)));
  assert.ok(notes.includes("Condiciones de compra: https://www.erasesuvez.com/condiciones"));
  assert.ok(notes.some((n) => n.startsWith("Vende: Érase su vez. Para cualquier cosa, escríbenos a hola@erasesuvez.com")));
  assert.ok(notes.some((n) => /no se imprime hasta que la mandes a imprimir/.test(n)));
  // Stripe reintenta: «duplicate», pero el recibo ya salió
  const again = await recordStripePayment(store, ev);
  assert.equal(again.action, "duplicate");
  assert.deepEqual(await mailReceipt(store, again, ev, deps), { status: "skipped" });
  assert.equal(sent.length, 1);
  void bookId;
});

test("recibo: un fallo pasajero pide reintento (el webhook responde 500) y sale cuando Stripe reintenta; un pedido devuelto no lleva recibo", async () => {
  const { store, ev, r } = await paidBook();
  let answer: { sent: boolean; reason?: string } = { sent: false, reason: "resend_503" };
  const deps = { send: async () => answer, link, conditionsLink: "c", seller: "Érase su vez", contact: null };
  assert.deepEqual(await mailReceipt(store, r, ev, deps), { status: "retry" });
  answer = { sent: false, reason: "red" };
  assert.deepEqual(await mailReceipt(store, r, ev, deps), { status: "retry" });
  answer = { sent: true };
  assert.deepEqual(await mailReceipt(store, { action: "duplicate", bookId: r.action === "paid" ? r.bookId : "" }, ev, deps), { status: "sent" });
  const other = await paidBook();
  await recordChargeEvent(other.store, refund(), stripe);
  assert.deepEqual(await mailReceipt(other.store, other.r, other.ev, deps), { status: "skipped" });
});

test("recibo: una dirección que el correo rechaza no se reintenta (se avisa); sin correo configurado no pasa nada", async () => {
  const { store, ev, r } = await paidBook();
  const deps = (answer: { sent: boolean; reason?: string }) => ({ send: async () => answer, link, conditionsLink: "c", seller: "Érase su vez", contact: null });
  assert.deepEqual(await mailReceipt(store, r, ev, deps({ sent: false, reason: "resend_422" })), { status: "rejected", to: "pago@example.com", reason: "resend_422" });
  assert.deepEqual(await mailReceipt(store, r, ev, deps({ sent: false, reason: "resend_429" })), { status: "retry" });
  assert.deepEqual(await mailReceipt(store, r, ev, deps({ sent: false, reason: "sin_configurar" })), { status: "skipped" });
});

test("recibo del PDF sin renuncia en los metadatos: sin esa línea y sin envío", async () => {
  const lines = receiptLines({
    title: "T",
    kind: "illustrated",
    amountCents: 1490,
    paidAt: "2026-10-26T10:00:00Z",
    address: null,
    waiverAt: null,
    link: "l",
    conditionsLink: "c",
    seller: "Érase su vez",
    contact: null,
  });
  const f = Object.fromEntries(lines.facts);
  assert.equal(f["Total pagado"], "14,90 €, IVA incluido");
  assert.equal(f["Envío a"], undefined);
  assert.ok(!lines.notes.some((n) => /desistir/.test(n)));
  assert.equal(lines.notes.at(-1), "Vende: Érase su vez.");
});

/** Supabase de mentira para el borrado: devuelve estas filas a cualquier consulta. */
function fakeClient(rows: Record<string, unknown>[]) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
  q.then = (ok: (x: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok);
  return { from: () => q } as unknown as SupabaseClient<Database>;
}

function printDeps(over: Partial<PrintDeps> = {}): PrintDeps {
  return {
    mode: "dry-run",
    orderType: "draft",
    pageCount: 30,
    resolveProductUid: async () => "photobooks-hardcover_x",
    productSize: async () => ({ trimWidth: 280, trimHeight: 210, bleed: 4 }),
    coverGeometry: async () => estimatedCover(),
    estimatedCover,
    render: async () => new Uint8Array([37, 80, 68, 70]),
    createOrder: async () => ({ id: "gel-1", status: "created", orderReferenceId: null, trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null }),
    getOrder: async () => null,
    mail: { sentToPrint: async () => ({ sent: true }), shipped: async () => ({ sent: true }), reminder: async () => ({ sent: true }) },
    link,
    trackLink: (id) => `https://www.erasesuvez.com/seguimiento/${id}`,
    ...over,
  };
}

test("disputa abierta: el libro no se borra al caducar y el cron lo alarga (una disputa dura de 60 a 75 días)", async () => {
  const held = { stripe_session_id: "cs_test_1", print_status: "canceled", print_error: DISPUTE_HOLD };
  assert.equal(await supabasePurgeDb(fakeClient([held]), {}).printPending!("b"), true);
  assert.equal(await supabasePurgeDb(fakeClient([{ ...held, print_error: "devuelto" }]), {}).printPending!("b"), false, "cancelada por otra cosa, no");

  const { state, store, bookId } = await paidBook("hardcover");
  await recordChargeEvent(store, dispute("charge.dispute.created"), stripe);
  state.books.get(bookId)!.expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  assert.equal((await printCron(store, printDeps())).kept, 1);
  assert.ok(Date.parse(state.books.get(bookId)!.expiresAt!) - Date.now() > 20 * 24 * 3600 * 1000);
});

test("durante la disputa no se piden versiones nuevas de las páginas", async () => {
  const { store, bookId } = await paidBook("hardcover");
  await recordChargeEvent(store, dispute("charge.dispute.created"), stripe);
  const r = await requestPages(store, { bookId, page: 1 }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.equal((r as { error?: string }).error, "printed");
});

test("devuelto mientras se maquetaba para la imprenta: no se crea el pedido en Gelato", async () => {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  await payDryRun(store, { bookId: start.bookId, edition: "hardcover", shipping: SHIPPING });
  assert.ok((await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM)).ok);
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, start.bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
  const s = await startPrint(store, start.bookId, "gelato", {});
  assert.ok(s.ok, JSON.stringify(s));
  // a una imprenta de verdad van imágenes con archivo y URL
  for (const j of await store.listJobs((await store.findBook({ publicId: start.bookId }))!.id)) if (j.status === "done") await store.updateJob(j.id, { storage_path: `books/x/${j.id}.png` });
  const signing = { ...store, signedUrl: async (path: string) => `https://files.example/${path}` };
  const created: string[] = [];
  // la devolución llega mientras se maqueta el PDF
  const deps = printDeps({
    mode: "gelato",
    render: async () => {
      await store.updateOrder(s.orderId, { status: "refunded" });
      return new Uint8Array([37, 80, 68, 70]);
    },
    createOrder: async (i) => (created.push(i.orderReferenceId), { error: "no debería llegar" }),
  });
  const r = await completePrint(signing, s.orderId, deps);
  assert.equal((r as { error?: string }).error, "refunded");
  assert.deepEqual(created, []);
  assert.equal((await store.getOrderById(s.orderId))!.printStatus, "canceled");
});

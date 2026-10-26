/**
 * Arreglos de la revisión independiente del 26 oct, antes de unir los PR de la auditoría. Sin red: memoria, dry-run,
 * modelos de mentira y clientes de Supabase falsos.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { MOCK_LLM, type Llm } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState, supabaseStore, type GenStore } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, payDryRun, prepareCheckout, recordStripePayment, savePlan, startBook } from "../../lib/book/service";
import { printCron, type PrintDeps } from "../../lib/book/print";
import { rescueBooks, type RescueDeps } from "../../lib/book/rescue";
import { freeUse } from "../../lib/book/freeLimit";
import { supabasePurgeDb } from "../../lib/purge";
import { estimatedCover } from "../../lib/print/gelato";
import { dropOrphanFamilyExtras, validatePlan } from "../../lib/plan/validate";
import { rewritePage } from "../../lib/plan/planner";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import type { Plan } from "../../lib/plan/types";

const ficha = normalizeFicha(EVAL_CASES[0]); // Vera y su perro Toby: ningún familiar en la ficha
const plan = mockPlan(ficha);
const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const PROD = { VERCEL_ENV: "production" };
const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" };
const soon = () => Date.now() + 60_000;

async function book(state = newMemoryState(), email = "vera@example.com") {
  const store = memoryStore(state);
  const start = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: soon() });
  return { state, store, bookId: start.bookId };
}

const session = (id: string, bookId: string, edition: "illustrated" | "hardcover" = "illustrated") => ({
  type: "checkout.session.completed",
  data: { object: { id, payment_status: "paid", amount_total: edition === "hardcover" ? 3490 : 1490, currency: "eur", metadata: { bookId, edition } } },
});

/** Muchos pedidos de prueba antiguos (la preview comparte base): llenaban la ventana de los crons. */
async function testOrders(store: GenStore, n: number, edition: "illustrated" | "hardcover") {
  for (let i = 0; i < n; i++) await store.addPaidOrder(`prueba-${i}`, { amountCents: 3490, edition, sessionId: `cs_test_${i}`, shipping: { ...ADDRESS, country: "ES" as const }, ...(edition === "hardcover" ? { printStatus: "awaiting_approval" as const } : {}) });
}

function printDeps(env: Record<string, string | undefined>): PrintDeps {
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
    now: () => new Date(),
    env,
  };
}

function rescueDeps(over: Partial<RescueDeps> = {}) {
  const notices: string[] = [];
  const d: RescueDeps = {
    adapter: dryRunAdapter,
    link: (id) => `https://www.erasesuvez.com/crear?b=${id}`,
    readyMail: async () => ({ sent: true }),
    notify: async (subject, text) => (notices.push(`${subject}|${text}`), { sent: true }),
    deadline: soon(),
    llm: MOCK_LLM,
    env: {},
    ...over,
  };
  return { deps: d, notices };
}

/** Cliente de Supabase falso: cualquier consulta encadenada devuelve `rows` (o un error). */
function fakeClient(rows: Record<string, unknown>[] | null) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "gte", "like", "order", "limit", "range"]) q[m] = () => q;
  q.then = (ok: (x: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(rows ? { data: rows, error: null } : { data: null, error: { message: "timeout" } }).then(ok, ko);
  return { from: () => q } as unknown as SupabaseClient<Database>;
}

test("Supabase: si falla la lectura de pedidos, hasPaidOrder lanza (un cobro doble no pasa por pedido nuevo)", async () => {
  await assert.rejects(supabaseStore(fakeClient(null)).hasPaidOrder("x"), /orders: timeout/);
  const { store, bookId } = await book();
  assert.equal((await recordStripePayment(store, session("cs_a", bookId))).action, "paid");
  const broken: GenStore = { ...store, hasPaidOrder: async () => Promise.reject(new Error("orders: timeout")) };
  await assert.rejects(recordStripePayment(broken, session("cs_b", bookId)), /timeout/, "el webhook responde 500 y Stripe reintenta");
});

test("crons de la imprenta: los pedidos de prueba acumulados no tapan a los reales en producción", async () => {
  const { state, store, bookId } = await book();
  await testOrders(store, 600, "hardcover");
  assert.ok((await prepareCheckout(store, { bookId, edition: "hardcover", shipping: ADDRESS })).ok);
  assert.equal((await recordStripePayment(store, session("cs_live_real", bookId, "hardcover"), PROD)).action, "paid");
  state.books.get(bookId)!.expiresAt = new Date(Date.now() + DAY).toISOString();
  assert.equal((await printCron(store, printDeps(PROD))).kept, 1);
});

test("rescate: los pedidos de prueba o ya terminados no dejan fuera al recién pagado", async () => {
  const { store, bookId } = await book();
  await testOrders(store, 600, "illustrated");
  assert.equal((await recordStripePayment(store, session("cs_live_r", bookId), PROD)).action, "paid");
  const { deps } = rescueDeps({ env: PROD });
  const r = await rescueBooks(store, deps);
  assert.equal(r.books, 1);
  assert.ok(r.painted >= 12, JSON.stringify(r));
});

test("rescate: si falla antes de pintar (texto caído), el aviso de libro atascado llega igual", async () => {
  const { store, bookId } = await book();
  assert.ok((await payDryRun(store, { bookId, edition: "illustrated" })).ok);
  const down: Llm = { name: "anthropic", model: "x", complete: async () => Promise.reject(new Error("529 overloaded")) };
  const { deps, notices } = rescueDeps({ llm: down, now: () => Date.now() + 3 * HOUR });
  const r = await rescueBooks(store, deps);
  assert.equal(r.errors, 1);
  assert.equal(r.alerted, 1);
  assert.match(notices[0], /El rescate ha fallado: 529 overloaded/);
  assert.equal((await rescueBooks(store, deps)).alerted, 0, "una vez por libro");
});

test("borrado: en producción solo conserva tapas duras con cobro real", async () => {
  const live = supabasePurgeDb(fakeClient([{ stripe_session_id: "cs_live_1" }]), PROD);
  const test = supabasePurgeDb(fakeClient([{ stripe_session_id: "cs_test_1" }]), PROD);
  assert.equal(await live.printPending!("b"), true);
  assert.equal(await test.printPending!("b"), false, "una tapa dura de prueba de la preview ya no se queda para siempre");
  assert.equal(await supabasePurgeDb(fakeClient([{ stripe_session_id: "cs_test_1" }]), {}).printPending!("b"), true, "fuera de producción, cualquiera");
});

test("pagos: el reintento de Stripe vuelve a alargar el libro; el pago de prueba también lo alarga", async () => {
  const { state, store, bookId } = await book();
  assert.equal((await recordStripePayment(store, session("cs_1", bookId))).action, "paid");
  state.books.get(bookId)!.expiresAt = new Date(Date.now() + DAY).toISOString(); // como si alargar hubiera fallado
  assert.equal((await recordStripePayment(store, session("cs_1", bookId))).action, "duplicate");
  assert.ok(Date.parse(state.books.get(bookId)!.expiresAt!) - Date.now() > 29 * DAY);

  const dry = await book();
  dry.state.books.get(dry.bookId)!.expiresAt = new Date(Date.now() + DAY).toISOString();
  assert.ok((await payDryRun(dry.store, { bookId: dry.bookId, edition: "illustrated" })).ok);
  assert.ok(Date.parse(dry.state.books.get(dry.bookId)!.expiresAt!) - Date.now() > 29 * DAY);
});

test("cuentos gratis: en producción, un pago de prueba no abre otra tanda; uno real, sí", async () => {
  const state = newMemoryState();
  const a = await book(state, "lola@example.com");
  for (let i = 0; i < 2; i++) await book(state, "lola@example.com");
  assert.equal((await recordStripePayment(a.store, session("cs_test_x", a.bookId))).action, "paid");
  assert.equal((await freeUse(a.store, "lola@example.com", { env: PROD })).used, 3, "el pagado con la tarjeta de prueba sigue contando como gratis");
  assert.equal((await freeUse(a.store, "lola@example.com", { env: {} })).used, 0, "en la preview, sí cuenta");
  assert.equal((await recordStripePayment(a.store, session("cs_live_x", a.bookId), PROD)).action, "paid");
  assert.equal((await freeUse(a.store, "lola@example.com", { env: PROD })).used, 0);
});

test("«Cambiar esta página» respeta a la familia que el padre ya escribió en esa misma página", async () => {
  const withMom: Plan = { ...plan, pages: plan.pages.map((p) => (p.n === 4 ? { ...p, text: `${p.text} Mamá le dio un beso.` } : p)) };
  const p4 = withMom.pages[3];
  let calls = 0;
  const llm: Llm = {
    name: "anthropic",
    model: "x",
    complete: async () => (calls++, { raw: JSON.stringify({ ...p4, text: `${p4.text} Y era de noche.` }), model: "x", usage: { input: 1, output: 1 }, ms: 1 }),
  };
  const r = await rewritePage(ficha, withMom, 4, "que sea de noche", llm);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(calls, 1, "a la primera");
  assert.match(r.page.text, /Mamá/);
});

test("«que salga la abuela» y después se borra la frase: los extras huérfanos se quitan y se puede dibujar", async () => {
  const p4 = plan.pages[3];
  const llm: Llm = {
    name: "anthropic",
    model: "x",
    complete: async () => ({ raw: JSON.stringify({ ...p4, text: `${p4.text} Llegó la abuela.`, extras: ["la abuela con un abrigo verde"] }), model: "x", usage: { input: 1, output: 1 }, ms: 1 }),
  };
  const page = await rewritePage(ficha, plan, 4, "que salga la abuela", llm);
  assert.ok(page.ok, JSON.stringify(page));
  assert.deepEqual(page.page.extras, ["la abuela con un abrigo verde"]);
  // el padre borra la frase a mano
  const edited: Plan = { ...plan, pages: plan.pages.map((p) => (p.n === 4 ? { ...page.page, text: p4.text } : p)) };
  assert.equal(validatePlan(edited, ficha, { fromParent: true }).usable, false, "sin limpiar, no se podía dibujar");
  assert.deepEqual(dropOrphanFamilyExtras(edited, ficha).pages[3].extras, []);
  const store = memoryStore(newMemoryState());
  const r = await startBook(store, { email: "abril@example.com", ficha, plan: edited, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(r.ok, JSON.stringify(r));
  const saved = await savePlan(store, { bookId: r.bookId, plan: edited });
  assert.deepEqual(saved, { ok: true });
});

test("validación: la escena tampoco puede traer familia inventada por el modelo; banderas y números en tecla no se imprimen", () => {
  const scene: Plan = { ...plan, pages: plan.pages.map((p) => (p.n === 5 ? { ...p, scene: `${p.scene} Su madre la arropa.` } : p)) };
  assert.equal(validatePlan(scene, ficha).usable, false);
  assert.equal(validatePlan(scene, ficha, { fromParent: true }).usable, true, "con el plan del padre no se miran las escenas (libros ya empezados)");
  for (const e of ["🇪🇸", "3️⃣"]) {
    const v = validatePlan({ ...plan, pages: plan.pages.map((p) => (p.n === 2 ? { ...p, text: `${p.text} ${e}` } : p)) }, ficha, { fromParent: true });
    assert.equal(v.issues.find((i) => i.hard)?.parent, "Quita el emoji de la página 2: no se puede imprimir.", e);
  }
});

test("el paso 4 distingue el tope del día (vuelve mañana) del tope del libro (no se renueva)", async () => {
  const { store, bookId } = await book();
  const b = (await store.findBook({ publicId: bookId }))!;
  const [sheet, cover] = (await store.listJobs(b.id)).filter((j) => j.kind === "sheet" || j.kind === "cover");
  await store.updateJob(sheet.id, { status: "failed", error: "presupuesto: tope diario (500 c) alcanzado: 500 c gastados hoy" });
  await store.updateJob(cover.id, { status: "failed", error: "presupuesto: tope por lead (60 c) alcanzado: 60 c gastados" });
  const v = await bookView(store, bookId);
  assert.ok(v.ok);
  assert.equal(v.jobs.find((j) => j.id === sheet.id)?.error, "budget");
  assert.equal(v.jobs.find((j) => j.id === cover.id)?.error, "limit");
});

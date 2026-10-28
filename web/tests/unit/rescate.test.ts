/**
 * Un libro pagado siempre termina (auditoría 26 oct, B4): los fallos pasajeros del proveedor no gastan intentos ni
 * versiones, y el rescate (/api/cron/rescue) retoma lo pendiente, lo fallido y lo colgado, manda el «listo» y avisa si un
 * libro lleva horas atascado. Sin red: memoria, dry-run, un proveedor caído de mentira y fetch simulado.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { TransientError, dryRunAdapter, getAdapter, isTransient, type GenerationAdapter } from "../../lib/generation/adapter";
import { runJob } from "../../lib/generation/service";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, recordStripePayment, requestPages, startBook } from "../../lib/book/service";
import { rescueBooks, type RescueDeps } from "../../lib/book/rescue";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { payApproved } from "./pagar";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const HOUR = 3600_000;
const soon = () => Date.now() + 60_000;

/** Gemini caído: 503 en cada imagen. */
const down: GenerationAdapter = {
  ...dryRunAdapter,
  generateImage: async () => {
    throw new TransientError("gemini 503: overloaded");
  },
};
/** Gemini rechaza la imagen (no es pasajero). */
const refuses: GenerationAdapter = {
  ...dryRunAdapter,
  generateImage: async () => {
    throw new Error("gemini sin imagen (IMAGE_SAFETY)");
  },
};

/** Libro con personajes hechos y pagado (pago de prueba), sin páginas todavía. */
async function paidBook(state = newMemoryState()) {
  const store = memoryStore(state);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: soon() });
  assert.ok((await payApproved(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  return { state, store, bookId: start.bookId };
}

function deps(over: Partial<RescueDeps> = {}) {
  const ready: string[] = [];
  const notices: string[] = [];
  const d: RescueDeps = {
    adapter: dryRunAdapter,
    link: (id) => `https://www.erasesuvez.com/crear?b=${id}`,
    readyMail: async (to) => (ready.push(to), { sent: true }),
    notify: async (subject) => (notices.push(subject), { sent: true }),
    deadline: soon(),
    llm: MOCK_LLM,
    env: {},
    ...over,
  };
  return { deps: d, ready, notices };
}

const pagesDone = async (store: ReturnType<typeof memoryStore>, bookId: string) => {
  const v = await bookView(store, bookId);
  assert.ok(v.ok);
  return Object.values(v.chosen.pages).filter(Boolean).length;
};

test("isTransient: 429, 5xx, red y tiempo agotado; un rechazo del modelo, no", () => {
  assert.equal(isTransient(new TransientError("gemini 429")), true);
  assert.equal(isTransient(new DOMException("timeout", "TimeoutError")), true);
  assert.equal(isTransient(Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } })), true);
  assert.equal(isTransient(new Error("gemini sin imagen (IMAGE_SAFETY)")), false);
  assert.equal(isTransient("x"), false);
});

test("Gemini: 503 y 429 son pasajeros, 400 no; las llamadas llevan tiempo de espera", async () => {
  const realFetch = globalThis.fetch;
  const key = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  const signals: (AbortSignal | null | undefined)[] = [];
  try {
    for (const [status, transient] of [[503, true], [429, true], [400, false]] as const) {
      globalThis.fetch = (async (_url: unknown, init?: RequestInit) => (signals.push(init?.signal), new Response("x", { status }))) as typeof fetch;
      const err = await getAdapter("gemini-images").generateImage("p", [], { aspect: "3:2", size: "1K" }).then(() => null, (e: unknown) => e);
      assert.ok(err instanceof Error, String(status));
      assert.equal(isTransient(err), transient, String(status));
    }
    assert.ok(signals.every((s) => s instanceof AbortSignal), "con tiempo de espera");
  } finally {
    globalThis.fetch = realFetch;
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
  }
});

test("un fallo pasajero no gasta el intento; un rechazo, sí", async () => {
  const { store, bookId } = await paidBook();
  const r = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok);
  const [a, b] = r.jobs;
  await runJob(store, a, down);
  const ja = (await store.getJob(a))!;
  assert.equal(ja.status, "failed");
  assert.equal(ja.attempts, 0);
  assert.match(ja.error ?? "", /^pasajero: gemini 503/);
  await runJob(store, b, refuses);
  assert.equal((await store.getJob(b))!.attempts, 1);
});

test("con Gemini caído, nueve visitas no rompen el libro: cuando vuelve, se termina sin versiones de más", async () => {
  const { store, bookId } = await paidBook();
  for (let i = 0; i < 9; i++) {
    const r = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
    assert.ok(r.ok, JSON.stringify(r));
    await paintAll(store, down, r.jobs, { concurrency: 3, deadline: soon() });
  }
  const book = (await store.findBook({ publicId: bookId }))!;
  const pages = (await store.listJobs(book.id)).filter((j) => j.kind === "page");
  assert.equal(pages.length, 12, "una por página: antes, 48 fallidas y 0 «Otra versión»");
  // vuelve Gemini
  const r = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok);
  await paintAll(store, dryRunAdapter, r.jobs, { concurrency: 3, deadline: soon() });
  assert.equal(await pagesDone(store, bookId), 12);
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.redosLeft === 8, `las «Otra versión» siguen enteras (${v.ok && v.redosLeft})`);
});

test("rescate: termina un libro pagado que nadie siguió pintando, manda el «listo» una vez y no vuelve a tocarlo", async () => {
  const { store, bookId } = await paidBook();
  const { deps: d, ready } = deps();
  const r1 = await rescueBooks(store, d);
  assert.equal(r1.books, 1);
  assert.ok(r1.painted >= 12, JSON.stringify(r1));
  assert.equal(r1.mailed, 1);
  assert.equal(await pagesDone(store, bookId), 12);
  assert.deepEqual(ready, ["vera@example.com"]);
  const r2 = await rescueBooks(store, d);
  assert.equal(r2.books, 0);
  assert.equal(ready.length, 1);
});

test("rescate: retoma las páginas colgadas (función cortada) y las fallidas con intentos", async () => {
  const { state, store, bookId } = await paidBook();
  const r = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok);
  await paintAll(store, dryRunAdapter, r.jobs.slice(0, 6), { concurrency: 3, deadline: soon() });
  Object.assign(state.jobs.get(r.jobs[6])!, { status: "running", attempts: 1, updated_at: new Date(Date.now() - 400_000).toISOString() });
  await runJob(store, r.jobs[7], down);
  const { deps: d, ready } = deps();
  await rescueBooks(store, d);
  assert.equal(await pagesDone(store, bookId), 12);
  assert.equal(ready.length, 1);
});

test("rescate: si lleva horas sin terminar, avisa a soporte una vez; si Gemini sigue caído, el libro sigue entero", async () => {
  const { store, bookId } = await paidBook();
  const later = () => Date.now() + 3 * HOUR;
  const { deps: d, notices, ready } = deps({ adapter: down, now: later });
  const r1 = await rescueBooks(store, d);
  assert.equal(r1.alerted, 1);
  assert.deepEqual(notices, ["Libro pagado sin terminar"]);
  await rescueBooks(store, d);
  assert.equal(notices.length, 1, "una vez por libro");
  assert.equal(ready.length, 0);
  // antes de las dos horas no se avisa
  const fresh = await paidBook();
  const early = deps({ adapter: down });
  await rescueBooks(fresh.store, early.deps);
  assert.equal(early.notices.length, 0);
  // cuando Gemini vuelve, el rescate lo termina
  const back = deps();
  await rescueBooks(store, back.deps);
  assert.equal(await pagesDone(store, bookId), 12);
  assert.equal(back.ready.length, 1);
});

test("rescate: cada entorno, sus pedidos (la preview no toca libros de clientes reales)", async () => {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email: "luis@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: soon() });
  const ev = { type: "checkout.session.completed", data: { object: { id: "cs_live_r1", payment_status: "paid", amount_total: 1490, metadata: { bookId: start.bookId, edition: "illustrated" } } } };
  assert.equal((await recordStripePayment(store, ev)).action, "paid");
  const preview = deps({ env: { VERCEL_ENV: "preview" } });
  assert.equal((await rescueBooks(store, preview.deps)).books, 0, "la preview no lo toca");
  const prod = deps({ env: { VERCEL_ENV: "production" } });
  assert.equal((await rescueBooks(store, prod.deps)).books, 1);
});

test("rescate: un libro terminado cuyo «listo» no se pudo mandar solo vuelve a intentar el email", async () => {
  const { store, bookId } = await paidBook();
  const { deps: d } = deps({ readyMail: async () => ({ sent: false }) });
  await rescueBooks(store, d);
  assert.equal(await pagesDone(store, bookId), 12);
  const book = (await store.findBook({ publicId: bookId }))!;
  const jobs = (await store.listJobs(book.id)).length;
  const again = await rescueBooks(store, d);
  assert.deepEqual([again.books, again.painted, again.mailed], [1, 0, 0]);
  assert.equal((await store.listJobs(book.id)).length, jobs, "no encola nada");
});

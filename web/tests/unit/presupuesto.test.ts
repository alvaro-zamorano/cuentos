/**
 * Presupuesto y portadas (26 oct): una imagen que el control de calidad mandó repetir se queda si ya no hay presupuesto
 * para repetirla, y un libro pagado nunca se queda sin portada.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter, type GenerationAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { qcFallback, runJob } from "../../lib/generation/service";
import { bookView, payDryRun, pendingPageJobs, requestPages, startBook } from "../../lib/book/service";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);

async function freshBook() {
  const store = memoryStore(newMemoryState());
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  return { store, start };
}

test("qcFallback: la última imagen de verdad del job, o nada", () => {
  assert.equal(qcFallback({ candidates: null }), null);
  assert.equal(qcFallback({ candidates: [] as never }), null);
  assert.equal(qcFallback({ candidates: ["dry-run/x.png"] as never }), null, "un placeholder no vale");
  assert.equal(qcFallback({ candidates: [{ path: "books/a/cover-1.jpg", qc: { pass: false, problems: ["piel"] } }] as never }), "books/a/cover-1.jpg");
  assert.equal(qcFallback({ candidates: [{ path: "books/a/v1.jpg" }, { path: "books/a/v2.jpg" }] as never }), "books/a/v2.jpg");
});

test("portada rechazada por el control de calidad y sin presupuesto para repetirla: se queda la que hay", async () => {
  const { store, start } = await freshBook();
  await paintAll(store, dryRunAdapter, [start.sheetJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  // como en producción el 25 oct: primer intento pintado y rechazado, vuelve a pendiente con su imagen
  await store.updateJob(start.coverJobId, {
    status: "pending",
    attempts: 1,
    cost_cents: 6,
    candidates: [{ path: "books/x/cover-1.jpg", qc: { pass: false, problems: ["la piel sale más clara"] } }] as never,
    error: "qc: la piel sale más clara",
  });
  // un proveedor con coste y sin presupuesto disponible (sin base en memoria): no se puede repetir
  const pricey: GenerationAdapter = {
    ...dryRunAdapter,
    name: "gemini-images",
    generateImage: async () => {
      throw new Error("no debería pintarse otra vez");
    },
  };
  const r = await runJob(store, start.coverJobId, pricey);
  assert.ok(r.ok, JSON.stringify(r));
  const job = (await store.getJob(start.coverJobId))!;
  assert.equal(job.status, "done");
  assert.equal(job.chosen, "books/x/cover-1.jpg");
  assert.match(job.error ?? "", /qc sin repetir/);
});

test("sin imagen previa y sin presupuesto, sigue fallando (no se inventa una portada)", async () => {
  const { store, start } = await freshBook();
  await paintAll(store, dryRunAdapter, [start.sheetJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  const pricey: GenerationAdapter = { ...dryRunAdapter, name: "gemini-images" };
  await runJob(store, start.coverJobId, pricey);
  assert.equal((await store.getJob(start.coverJobId))!.status, "failed");
});

test("libro pagado con la portada fallida: al pedir el libro se encarga otra, pagada, y se pinta", async () => {
  const { store, start } = await freshBook();
  await paintAll(store, dryRunAdapter, [start.sheetJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  await store.updateJob(start.coverJobId, { status: "failed", attempts: 2, error: "presupuesto: tope por lead" });
  assert.ok((await payDryRun(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  const r = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok, JSON.stringify(r));
  const pending = await pendingPageJobs(store, start.bookId);
  const jobs = await store.listJobs((await store.findBook({ publicId: start.bookId }))!.id);
  const newCover = jobs.find((j) => j.kind === "cover" && j.paid);
  assert.ok(newCover, "portada nueva, pagada");
  assert.equal(pending[0], newCover!.id, "la primera de la cola");
  await paintAll(store, dryRunAdapter, pending, { concurrency: 3, deadline: Date.now() + 30_000 });
  const v = await bookView(store, start.bookId);
  assert.ok(v.ok && v.chosen.cover === newCover!.id, "el libro ya tiene portada");
  // pedirlo otra vez no encarga más portadas
  await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  const covers = (await store.listJobs((await store.findBook({ publicId: start.bookId }))!.id)).filter((j) => j.kind === "cover");
  assert.equal(covers.length, 2);
});

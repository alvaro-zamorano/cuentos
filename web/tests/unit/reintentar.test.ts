/**
 * Paso 4 cuando falla el dibujo (auditoría 26 oct, B8): «Reintentar» lo repite sin empezar otro cuento, un libro sin
 * personajes no gasta cuento gratis y una portada colgada no deja el libro pagado sin portada. Sin red: memoria y dry-run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { TransientError, dryRunAdapter, type GenerationAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, requestPages, retryCast, reviseSheet, startBook, type StartResult } from "../../lib/book/service";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { payApproved } from "./pagar";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const deadline = () => Date.now() + 30_000;

/**
 * Gemini rechaza la imagen (un fallo que no es pasajero): cada intento falla y se gasta. Con un 503 o un 429 el intento
 * no se gasta (lib/generation/adapter.ts, `TransientError`): ese caso va en el último test.
 */
const down: GenerationAdapter = {
  ...dryRunAdapter,
  generateImage: async () => {
    throw new Error("gemini sin imagen (IMAGE_SAFETY)");
  },
};
/** Gemini caído de verdad (503): pasajero. */
const unavailable: GenerationAdapter = {
  ...dryRunAdapter,
  generateImage: async () => {
    throw new TransientError("gemini 503: UNAVAILABLE");
  },
};

async function started(email = "vera@example.com", state: ReturnType<typeof newMemoryState> = newMemoryState()) {
  const store = memoryStore(state);
  const r = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(r.ok, JSON.stringify(r));
  return { state, store, start: r };
}

const ok = (r: unknown): StartResult => {
  assert.ok((r as { ok: boolean }).ok, JSON.stringify(r));
  return r as StartResult;
};

test("falla una vez: «Reintentar» reabre la hoja y la portada, y salen", async () => {
  const { store, start } = await started();
  await paintAll(store, down, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: deadline() });
  assert.equal((await store.getJob(start.sheetJobId))?.status, "failed");
  assert.equal((await store.getJob(start.coverJobId))?.status, "failed", "sin hoja, la portada también falla");

  const r = ok(await retryCast(store, { bookId: start.bookId }, dryRunAdapter));
  assert.equal(r.sheetJobId, start.sheetJobId, "la misma hoja, no otro cuento");
  assert.equal(r.reopened, 2);
  assert.equal(r.created, 0);
  await paintAll(store, dryRunAdapter, [r.sheetJobId, r.coverJobId], { concurrency: 1, deadline: deadline() });
  const v = await bookView(store, start.bookId);
  assert.ok(v.ok && v.chosen.sheet === start.sheetJobId && v.chosen.cover === start.coverJobId);
  assert.equal(v.sheetsLeft, 2, "los dos cambios siguen ahí");
});

test("falla del todo (sin intentos): «Reintentar» pinta otra versión y no gasta un cambio", async () => {
  const { store, start } = await started();
  await paintAll(store, down, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: deadline() });
  ok(await retryCast(store, { bookId: start.bookId }, dryRunAdapter));
  await paintAll(store, down, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: deadline() });
  assert.equal((await store.getJob(start.sheetJobId))?.attempts, 2, "ya no le quedan intentos");

  const r = ok(await retryCast(store, { bookId: start.bookId }, dryRunAdapter));
  assert.notEqual(r.sheetJobId, start.sheetJobId);
  assert.equal(r.created, 2);
  assert.equal((await store.getJob(r.sheetJobId))?.prompt, (await store.getJob(start.sheetJobId))?.prompt, "el mismo reparto");
  await paintAll(store, dryRunAdapter, [r.sheetJobId, r.coverJobId], { concurrency: 1, deadline: deadline() });
  const v = await bookView(store, start.bookId);
  assert.ok(v.ok && v.chosen.sheet === r.sheetJobId && v.chosen.cover === r.coverJobId);
  assert.equal(v.sheetsLeft, 2, "la que falló no cuenta como versión");
  // y los dos cambios con palabras siguen funcionando
  ok(await reviseSheet(store, { bookId: start.bookId, instruction: "más rizos" }, dryRunAdapter, MOCK_LLM));
  ok(await reviseSheet(store, { bookId: start.bookId, instruction: "sin pecas" }, dryRunAdapter, MOCK_LLM));
  const after = await reviseSheet(store, { bookId: start.bookId, instruction: "otras gafas" }, dryRunAdapter, MOCK_LLM);
  assert.equal((after as { error: string }).error, "max_versions", "nunca más de lo que admite la base");
});

test("la portada falla del todo con la hoja hecha: se pinta otra portada para la misma hoja", async () => {
  const { store, start } = await started();
  await paintAll(store, dryRunAdapter, [start.sheetJobId], { concurrency: 1, deadline: deadline() });
  await paintAll(store, down, [start.coverJobId], { concurrency: 1, deadline: deadline() });
  ok(await retryCast(store, { bookId: start.bookId }, dryRunAdapter));
  await paintAll(store, down, [start.coverJobId], { concurrency: 1, deadline: deadline() });
  assert.equal((await store.getJob(start.coverJobId))?.attempts, 2);

  const r = ok(await retryCast(store, { bookId: start.bookId }, dryRunAdapter));
  assert.equal(r.sheetJobId, start.sheetJobId, "la hoja hecha no se repite");
  assert.notEqual(r.coverJobId, start.coverJobId);
  assert.equal(r.created, 1);
  await paintAll(store, dryRunAdapter, [r.coverJobId], { concurrency: 1, deadline: deadline() });
  const v = await bookView(store, start.bookId);
  assert.ok(v.ok && v.chosen.cover === r.coverJobId, "la portada nueva es la del libro");
});

test("si no falló nada, «Reintentar» no cambia nada; con el libro pagado, no se usa", async () => {
  const { store, start } = await started();
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: deadline() });
  const r = ok(await retryCast(store, { bookId: start.bookId }, dryRunAdapter));
  assert.deepEqual([r.sheetJobId, r.coverJobId, r.created, r.reopened], [start.sheetJobId, start.coverJobId, 0, 0]);
  assert.ok((await payApproved(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  assert.equal((await retryCast(store, { bookId: start.bookId }, dryRunAdapter) as { error: string }).error, "already_paid");
  assert.equal((await retryCast(store, { bookId: "zzzzzzzzzz" }, dryRunAdapter) as { status: number }).status, 404);
});

test("un libro cuyos dibujos fallaron no gasta cuento gratis; al reintentarlo, pasa por la puerta", async () => {
  const state = newMemoryState();
  const a = await started("ana@example.com", state);
  await paintAll(a.store, down, [a.start.sheetJobId, a.start.coverJobId], { concurrency: 1, deadline: deadline() });
  const lefts: (number | undefined)[] = [];
  for (let i = 0; i < 3; i++) lefts.push((await started("ana@example.com", state)).start.freeLeft);
  assert.deepEqual(lefts, [2, 1, 0], "el que falló no cuenta: después caben los tres");
  // ya hay tres con personajes: el que falló no se vuelve a dibujar gratis
  const r = await retryCast(a.store, { bookId: a.start.bookId }, dryRunAdapter);
  assert.equal((r as { error: string }).error, "free_limit");
});

test("un libro que se está pintando sí cuenta (no se pueden abrir muchos a la vez)", async () => {
  const state = newMemoryState();
  for (let i = 0; i < 3; i++) await started("luis@example.com", state);
  const store = memoryStore(state);
  const r = await startBook(store, { email: "luis@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.equal((r as { error: string }).error, "free_limit");
});

test("tras pagar, una portada colgada (más de 330 s «pintando») se da por perdida y se pinta otra", async () => {
  const { state, store, start } = await started();
  await paintAll(store, dryRunAdapter, [start.sheetJobId], { concurrency: 1, deadline: deadline() });
  // Vercel cortó la función a mitad de la portada gratis
  Object.assign(state.jobs.get(start.coverJobId)!, { status: "running", attempts: 1, updated_at: new Date(Date.now() - 400_000).toISOString() });
  assert.ok((await payApproved(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  const pages = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: true }, MOCK_LLM);
  assert.ok(pages.ok, JSON.stringify(pages));
  const covers = (await store.listJobs((await store.getJob(start.sheetJobId))!.book_id)).filter((j) => j.kind === "cover");
  assert.equal(covers.find((j) => j.id === start.coverJobId)?.status, "failed", "la colgada queda como fallida");
  const fresh = covers.find((j) => j.id !== start.coverJobId);
  assert.ok(fresh?.paid && pages.jobs.includes(fresh.id), "la nueva va en la tanda de después del pago");

  // y si la colgada es la pagada y le quedan intentos, se reanuda esa misma
  Object.assign(state.jobs.get(fresh.id)!, { status: "running", attempts: 1, updated_at: new Date(Date.now() - 400_000).toISOString() });
  const again = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: true }, MOCK_LLM);
  assert.ok(again.ok && again.jobs.includes(fresh.id));
  await paintAll(store, dryRunAdapter, [fresh.id], { concurrency: 1, deadline: deadline() });
  assert.equal((await store.getJob(fresh.id))?.status, "done");
  const v = await bookView(store, start.bookId);
  assert.ok(v.ok && v.chosen.cover === fresh.id);
});

test("una portada que se está pintando de verdad (menos de 330 s) no se toca", async () => {
  const { state, store, start } = await started();
  await paintAll(store, dryRunAdapter, [start.sheetJobId], { concurrency: 1, deadline: deadline() });
  Object.assign(state.jobs.get(start.coverJobId)!, { status: "running", attempts: 1, updated_at: new Date(Date.now() - 60_000).toISOString() });
  assert.ok((await payApproved(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  const pages = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: true }, MOCK_LLM);
  assert.ok(pages.ok);
  const covers = (await store.listJobs((await store.getJob(start.sheetJobId))!.book_id)).filter((j) => j.kind === "cover");
  assert.equal(covers.length, 1);
  assert.equal(covers[0].status, "running");
});

test("con Gemini caído (503), «Reintentar» reabre la misma hoja las veces que haga falta, sin gastar versiones", async () => {
  const { store, start } = await started("nico@example.com");
  for (let i = 0; i < 4; i++) {
    await paintAll(store, unavailable, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: deadline() });
    assert.equal((await store.getJob(start.sheetJobId))?.attempts, 0, "el intento no se gasta");
    const r = ok(await retryCast(store, { bookId: start.bookId }, dryRunAdapter));
    assert.equal(r.sheetJobId, start.sheetJobId);
    assert.equal(r.created, 0);
  }
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: deadline() });
  const v = await bookView(store, start.bookId);
  assert.ok(v.ok && v.chosen.sheet === start.sheetJobId && v.sheetsLeft === 2);
});

/**
 * Las 12 páginas se encargan una sola vez aunque las pidan a la vez el webhook del pago y el navegador, o dos pestañas
 * (auditoría 26 oct, I1). Sin red: memoria, dry-run y un modelo de mentira que tarda y escribe distinto cada vez, como
 * el de verdad.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Llm } from "../../lib/llm";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { choosePage, draftV2, payDryRun, pendingPageJobs, requestPages, savePlan, startBook } from "../../lib/book/service";
import { hashString } from "../../lib/story/hash";
import { pageArtKey } from "../../lib/plan/art";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const fast = { sleep: () => new Promise<void>((r) => setTimeout(r, 1)) };

/** Dirección de arte de mentira: tarda 30 ms y cada llamada redacta las escenas a su manera. */
function slowArt() {
  let calls = 0;
  const llm: Llm = {
    name: "anthropic",
    model: "de-mentira",
    complete: async () => {
      const take = ++calls;
      await new Promise((r) => setTimeout(r, 30));
      const pages = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, sceneEn: `scene ${i + 1}, take ${take}`, outfitEn: null, extrasEn: [] }));
      return { raw: JSON.stringify({ pages }), model: "de-mentira", usage: { input: 1, output: 1 }, ms: 30 };
    },
  };
  return { llm, calls: () => calls };
}

async function paidBook() {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  assert.ok((await payDryRun(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  return { state, store, bookId: start.bookId };
}

const pageJobs = async (store: ReturnType<typeof memoryStore>, bookId: string) => (await store.listJobs((await store.findBook({ publicId: bookId }))!.id)).filter((j) => j.kind === "page");

test("dos peticiones a la vez: 12 páginas, no 24, y una sola dirección de arte", async () => {
  for (let round = 0; round < 5; round++) {
    const { store, bookId } = await paidBook();
    const art = slowArt();
    const opts = { dryRunPayment: false, ...fast };
    const [a, b] = await Promise.all([requestPages(store, { bookId }, dryRunAdapter, opts, art.llm), requestPages(store, { bookId }, dryRunAdapter, opts, art.llm)]);
    assert.ok(a.ok && b.ok, JSON.stringify([a, b]));
    const jobs = await pageJobs(store, bookId);
    assert.equal(jobs.length, 12, `tanda ${round}: ${jobs.length} trabajos`);
    assert.deepEqual([...new Set(jobs.map((j) => j.page_n))].sort((x, y) => x! - y!), Array.from({ length: 12 }, (_, i) => i + 1));
    assert.equal(art.calls(), 1, `tanda ${round}: ${art.calls()} direcciones de arte`);
    // lo que devuelven las dos son trabajos que existen (la segunda, nada nuevo), y todos salen de la misma dirección de arte
    const ids = new Set((await store.listJobs((await store.findBook({ publicId: bookId }))!.id)).map((j) => j.id));
    assert.ok([...a.jobs, ...b.jobs].every((id) => ids.has(id)));
    assert.equal(new Set(jobs.map((j) => /take (\d+)/.exec(j.prompt)?.[1])).size, 1);
  }
});

test("una detrás de otra: la segunda no encarga nada ni vuelve a llamar al modelo", async () => {
  const { store, bookId } = await paidBook();
  const art = slowArt();
  assert.ok((await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false, ...fast }, art.llm)).ok);
  const again = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false, ...fast }, art.llm);
  assert.ok(again.ok && again.created === 0);
  assert.equal((await pageJobs(store, bookId)).length, 12);
  assert.equal(art.calls(), 1);
});

test("si la dirección de arte de la otra petición falla, esta no espera para nada: la hace ella", async () => {
  const { store, bookId } = await paidBook();
  const art = slowArt();
  const broken: Llm = { ...art.llm, complete: async () => Promise.reject(new Error("529 overloaded")) };
  await assert.rejects(requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false, ...fast }, broken), /529/);
  const book = (await store.findBook({ publicId: bookId }))!;
  assert.equal(draftV2(book)?.pagesArtPending, undefined, "sin marca colgada");
  assert.ok((await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false, ...fast }, art.llm)).ok);
  assert.equal((await pageJobs(store, bookId)).length, 12);
});

test("las páginas pintadas con la huella de antes siguen valiendo: no se repintan", async () => {
  const { state, store, bookId } = await paidBook();
  assert.ok((await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false, ...fast }, MOCK_LLM)).ok);
  const book = (await store.findBook({ publicId: bookId }))!;
  const d = draftV2(book)!;
  // como las de los libros ya pagados: el prompt dentro de la huella
  for (const j of state.jobs.values()) {
    if (j.kind !== "page") continue;
    const sheet = (j.references as unknown as { kind: string; job_id?: string }[]).find((r) => r.kind === "sheet")!.job_id!;
    j.job_key = `page:${j.page_n}:${j.variant}:${hashString(`${pageArtKey(d.castArt!, d.plan.pages[j.page_n! - 1])}|${j.prompt}|${sheet}`)}`;
  }
  const again = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false, ...fast }, MOCK_LLM);
  assert.ok(again.ok && again.created === 0);
  assert.equal((await pageJobs(store, bookId)).length, 12);
});

test("«Otra versión» pulsada dos veces a la vez: una sola versión nueva", async () => {
  const { store, bookId } = await paidBook();
  assert.ok((await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false, ...fast }, MOCK_LLM)).ok);
  const ask = { bookId, page: 3, reason: "cuerpo" };
  const [a, b] = await Promise.all([
    requestPages(store, ask, dryRunAdapter, { dryRunPayment: false, ...fast }, MOCK_LLM),
    requestPages(store, ask, dryRunAdapter, { dryRunPayment: false, ...fast }, MOCK_LLM),
  ]);
  assert.ok(a.ok || b.ok);
  const p3 = (await pageJobs(store, bookId)).filter((j) => j.page_n === 3);
  assert.deepEqual(p3.map((j) => j.variant).sort(), [1, 2]);
});

test("I13: un texto corregido mientras se hace la dirección de arte no se pierde", async () => {
  const { store, bookId } = await paidBook();
  const art = slowArt();
  const book = (await store.findBook({ publicId: bookId }))!;
  const edited = { ...draftV2(book)!.plan, pages: draftV2(book)!.plan.pages.map((p) => (p.n === 2 ? { ...p, text: `${p.text} Y entonces se rio.` } : p)) };
  const pages = requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false, ...fast }, art.llm);
  await new Promise((r) => setTimeout(r, 10)); // la dirección de arte tarda 30 ms: el padre guarda entre medias
  assert.deepEqual(await savePlan(store, { bookId, plan: edited }), { ok: true });
  assert.ok((await pages).ok);
  const d = draftV2((await store.findBook({ publicId: bookId }))!)!;
  assert.match(d.plan.pages[1].text, /Y entonces se rio\.$/);
  assert.ok(d.pagesArt, "y la dirección de arte también está");
  assert.equal(d.pagesArtPending, undefined);
});

test("I13: dos cambios a la vez sobre el mismo borrador se quedan los dos", async () => {
  const { store, bookId } = await paidBook();
  const jobs = (await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false, ...fast }, MOCK_LLM)) as { jobs: string[] };
  await paintAll(store, dryRunAdapter, jobs.jobs, { concurrency: 4, deadline: Date.now() + 30_000 });
  const all = (await pageJobs(store, bookId)).filter((j) => j.status === "done");
  const book = (await store.findBook({ publicId: bookId }))!;
  const edited = { ...draftV2(book)!.plan, title: "Vera y la caja" };
  const [a, b] = await Promise.all([choosePage(store, { bookId, jobId: all[0].id }), savePlan(store, { bookId, plan: edited })]);
  assert.ok(a.ok && b.ok);
  const d = draftV2((await store.findBook({ publicId: bookId }))!)!;
  assert.equal(d.plan.title, "Vera y la caja");
  assert.equal(d.pageChoice?.[all[0].page_n!], all[0].id);
});

test("«Otra versión» de la misma página desde dos pestañas a la vez: una sola versión 2 (menores de la auditoría 26 oct)", async () => {
  const { store, bookId } = await paidBook();
  assert.ok((await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM)).ok);
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
  const ask = () => requestPages(store, { bookId, page: 3, reason: "cuerpo" }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  const [a, b] = await Promise.all([ask(), ask()]);
  assert.ok(a.ok && b.ok);
  assert.deepEqual(a.jobs, b.jobs, "las dos pestañas esperan la misma versión");
  assert.deepEqual((await pageJobs(store, bookId)).filter((j) => j.page_n === 3).map((j) => j.variant).sort(), [1, 2]);
});

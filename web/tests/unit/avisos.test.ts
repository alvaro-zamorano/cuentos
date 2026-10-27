/**
 * Una imagen pagada que no sale no deja al padre sin salida ni a soporte sin saberlo (auditoría 26 oct, I3 e I12).
 * Sin red: memoria, dry-run y avisos de mentira.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter, TransientError, type GenerationAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { alertPaidFailures, MAX_PAGE_JOBS, paidFailure, payDryRun, pendingPageJobs, reportPage, requestPages, startBook } from "../../lib/book/service";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const soon = () => Date.now() + 60_000;
const link = (id: string) => `https://www.erasesuvez.com/crear?b=${id}`;

/** Gemini rechaza la imagen (no es pasajero). */
const refuses: GenerationAdapter = { ...dryRunAdapter, generateImage: async () => Promise.reject(new Error("gemini sin imagen (IMAGE_SAFETY)")) };
const unavailable: GenerationAdapter = { ...dryRunAdapter, generateImage: async () => Promise.reject(new TransientError("gemini 503")) };

async function paidBook() {
  const store = memoryStore(newMemoryState());
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: soon() });
  assert.ok((await payDryRun(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  const r = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok);
  return { store, bookId: start.bookId, jobs: r.jobs };
}

test("paidFailure: solo lo pagado que agotó intentos sin ser pasajero, o chocó con el tope del libro", () => {
  const base = { paid: true, status: "failed" as const, attempts: 2, error: "gemini sin imagen" };
  assert.equal(paidFailure(base), true);
  assert.equal(paidFailure({ ...base, attempts: 1 }), false, "le queda un intento");
  assert.equal(paidFailure({ ...base, error: "pasajero: gemini 503" }), false);
  assert.equal(paidFailure({ ...base, attempts: 0, error: "tope de coste por libro (300 c) alcanzado" }), true);
  assert.equal(paidFailure({ ...base, paid: false }), false, "lo gratis no");
  assert.equal(paidFailure({ ...base, status: "done" as never }), false);
});

test("aviso a soporte solo de lo que ya no va a salir solo: una página sin versiones automáticas, una vez por job", async () => {
  const { store, bookId, jobs } = await paidBook();
  const notices: string[] = [];
  const notify = async (subject: string, text: string) => (notices.push(`${subject}|${text}`), { sent: true });
  const pages = { dryRunPayment: false };
  // pasajero: no avisa
  await paintAll(store, unavailable, [jobs[0]], { concurrency: 1, deadline: soon() });
  assert.equal(await alertPaidFailures(store, bookId, notify, link), false);
  // la página 2 falla dos veces: aún queda otra versión automática (la pide el siguiente requestPages), no avisa
  await paintAll(store, refuses, [jobs[1]], { concurrency: 1, deadline: soon() });
  assert.ok((await requestPages(store, { bookId }, dryRunAdapter, pages, MOCK_LLM)).ok);
  await paintAll(store, refuses, [jobs[1]], { concurrency: 1, deadline: soon() });
  assert.equal(await alertPaidFailures(store, bookId, notify, link), false, "con hueco para otra versión, no");
  // sigue fallando hasta agotar las versiones de la página: ahora sí
  for (let round = 0; round < 6; round++) {
    const r = await requestPages(store, { bookId }, dryRunAdapter, pages, MOCK_LLM);
    assert.ok(r.ok);
    await paintAll(store, refuses, await pendingPageJobs(store, bookId), { concurrency: 4, deadline: soon() });
  }
  const p2 = (await store.listJobs(bookId)).filter((j) => j.kind === "page" && j.page_n === 2);
  assert.equal(p2.length, MAX_PAGE_JOBS);
  assert.equal(await alertPaidFailures(store, bookId, notify, link), true);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /^Imagen pagada que no sale: «Vera y la gran idea»\|.*página 2 \(versión 4: gemini sin imagen/);
  assert.doesNotMatch(notices[0], /retrato/, "los retratos no cuentan: el libro usa la hoja");
  assert.equal(await alertPaidFailures(store, bookId, notify, link), false, "el mismo job, una vez");
});

test("tope de coste por libro: no se reabre en cada recarga, «Avísanos» queda a la vista y soporte lo sabe", async () => {
  const { store, bookId, jobs } = await paidBook();
  await paintAll(store, dryRunAdapter, jobs.filter((_, i) => i !== 4), { concurrency: 4, deadline: soon() });
  // la página 5 choca con el tope del libro (no gasta intentos)
  const p5 = (await store.getJob(jobs[4]))!;
  await store.updateJob(p5.id, { status: "failed", error: "tope de coste por libro (300 c) alcanzado" });
  const again = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(again.ok && !again.jobs.includes(p5.id), "no se reabre");
  assert.equal((await store.getJob(p5.id))!.status, "failed");
  const notices: string[] = [];
  assert.equal(await alertPaidFailures(store, bookId, async (s, t) => (notices.push(`${s}|${t}`), { sent: true }), link), true);
  assert.match(notices[0], /página 5[^]*tope de coste por libro/);
});

test("«Avísanos» de una página que no ha salido nunca: el aviso lo dice en el asunto", async () => {
  const { store, bookId, jobs } = await paidBook();
  await paintAll(store, refuses, [jobs[2]], { concurrency: 1, deadline: soon() });
  const mails: string[] = [];
  const r = await reportPage(store, { bookId, page: 3, note: "no carga" }, async (subject) => (mails.push(subject), { sent: true }), link);
  assert.deepEqual(r, { ok: true });
  assert.equal(mails[0], "No sale: página 3 de «Vera y la gran idea»");
});

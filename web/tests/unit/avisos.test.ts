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
import { alertPaidFailures, paidFailure, payDryRun, reportPage, requestPages, startBook } from "../../lib/book/service";
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

test("una página pagada que agota sus intentos avisa a soporte una vez por libro; un fallo pasajero, no", async () => {
  const { store, bookId, jobs } = await paidBook();
  const notices: string[] = [];
  const notify = async (subject: string, text: string) => (notices.push(`${subject}|${text}`), { sent: true });
  // pasajero: no avisa
  await paintAll(store, unavailable, [jobs[0]], { concurrency: 1, deadline: soon() });
  assert.equal(await alertPaidFailures(store, bookId, notify, link), false);
  // dos rechazos seguidos en la página 2 (se reabre entre medias, como al volver al libro)
  await paintAll(store, refuses, [jobs[1]], { concurrency: 1, deadline: soon() });
  assert.ok((await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM)).ok);
  await paintAll(store, refuses, [jobs[1]], { concurrency: 1, deadline: soon() });
  assert.equal(await alertPaidFailures(store, bookId, notify, link), true);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /^Imagen pagada que no sale: «Vera y la gran idea»\|.*página 2 \(versión 1: gemini sin imagen/);
  assert.match(notices[0], new RegExp(`crear\\?b=${bookId}`));
  assert.equal(await alertPaidFailures(store, bookId, notify, link), false, "una vez por libro");
});

test("«Avísanos» de una página que no ha salido nunca: el aviso lo dice en el asunto", async () => {
  const { store, bookId, jobs } = await paidBook();
  await paintAll(store, refuses, [jobs[2]], { concurrency: 1, deadline: soon() });
  const mails: string[] = [];
  const r = await reportPage(store, { bookId, page: 3, note: "no carga" }, async (subject) => (mails.push(subject), { sent: true }), link);
  assert.deepEqual(r, { ok: true });
  assert.equal(mails[0], "No sale: página 3 de «Vera y la gran idea»");
});

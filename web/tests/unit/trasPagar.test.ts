/**
 * Después de pagar, volver a los pasos 3 y 4 no repinta el libro a nuestra costa ni gasta las «Otra versión» del padre
 * (auditoría 26 oct, I2). Sin red: memoria y dry-run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { approveSheet, bookView, requestPages, reviseSheet, savePlan, startBook } from "../../lib/book/service";
import { MAX_BOOK_REDOS } from "../../lib/book/feedback";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { payApproved } from "./pagar";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const soon = () => Date.now() + 30_000;
const email = "vera@example.com";

/** Dos versiones de los personajes, la segunda aprobada, pagado y con las 12 páginas encargadas. */
async function paidWithTwoSheets() {
  const state = newMemoryState();
  const store = memoryStore(state);
  const s1 = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(s1.ok);
  await paintAll(store, dryRunAdapter, [s1.sheetJobId, s1.coverJobId], { concurrency: 1, deadline: soon() });
  const s2 = await reviseSheet(store, { bookId: s1.bookId, instruction: "más rizos" }, dryRunAdapter, MOCK_LLM);
  assert.ok(s2.ok);
  await paintAll(store, dryRunAdapter, [s2.sheetJobId, s2.coverJobId], { concurrency: 1, deadline: soon() });
  assert.ok((await approveSheet(store, { bookId: s1.bookId, sheetJobId: s2.sheetJobId })).ok);
  assert.ok((await payApproved(store, { bookId: s1.bookId, edition: "illustrated" })).ok);
  const pages = await requestPages(store, { bookId: s1.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(pages.ok && pages.created === 12);
  return { state, store, bookId: s1.bookId, sheet1: s1.sheetJobId, sheet2: s2.sheetJobId };
}

const pageCount = async (store: ReturnType<typeof memoryStore>, bookId: string) => (await store.listJobs(bookId)).filter((j) => j.kind === "page").length;

test("pagado: otra versión de los personajes o elegir la otra hoja, 409; la aprobada otra vez, sí", async () => {
  const { store, bookId, sheet1, sheet2 } = await paidWithTwoSheets();
  const revise = await reviseSheet(store, { bookId, instruction: "sin pecas" }, dryRunAdapter, MOCK_LLM);
  assert.equal(!revise.ok && revise.error, "already_paid");
  const other = await approveSheet(store, { bookId, sheetJobId: sheet1 });
  assert.equal(!other.ok && other.error, "already_paid");
  assert.ok((await approveSheet(store, { bookId, sheetJobId: sheet2 })).ok, "el paso 4 vuelve a aprobar la misma al seguir");
  const again = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(again.ok && again.created === 0);
  assert.equal(await pageCount(store, bookId), 12);
});

test("pagado: empezar otra vez el mismo libro desde el paso 4, 409", async () => {
  const { store, bookId } = await paidWithTwoSheets();
  const other = { ...plan, title: "Otra historia" };
  const r = await startBook(store, { bookId, email, ficha, plan: other, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.equal(!r.ok && r.error, "already_paid");
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.plan.title === plan.title);
});

test("pagado: un cuento con escenas nuevas (otra pestaña, «Escribirlo de otra manera») se rechaza; los textos solos, sí", async () => {
  const { store, bookId } = await paidWithTwoSheets();
  const rewritten = { ...plan, title: "Vera en la Luna", pages: plan.pages.map((p) => ({ ...p, text: `Otra vez: ${p.text}`, scene: `Escena nueva ${p.n}.` })) };
  const r = await savePlan(store, { bookId, plan: rewritten });
  assert.equal(!r.ok && r.error, "already_paid", "no se injerta un texto nuevo en dibujos viejos");
  let v = await bookView(store, bookId);
  assert.ok(v.ok && v.plan.title === plan.title);
  const textOnly = { ...plan, title: "Vera en la Luna", pages: plan.pages.map((p) => ({ ...p, text: `Otra vez: ${p.text}` })) };
  assert.ok((await savePlan(store, { bookId, plan: textOnly })).ok);
  v = await bookView(store, bookId);
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.equal(v.plan.title, "Vera en la Luna");
  assert.ok(v.plan.pages.every((p, i) => p.text.startsWith("Otra vez: ") && p.scene === plan.pages[i].scene));
  const again = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(again.ok && again.created === 0);
  assert.equal(await pageCount(store, bookId), 12);
});

test("no se paga con unos personajes nuevos todavía dibujándose; la hoja de las páginas pagadas queda fijada", async () => {
  const store = memoryStore(newMemoryState());
  const s1 = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(s1.ok);
  await paintAll(store, dryRunAdapter, [s1.sheetJobId, s1.coverJobId], { concurrency: 1, deadline: soon() });
  const s2 = await reviseSheet(store, { bookId: s1.bookId, instruction: "más rizos" }, dryRunAdapter, MOCK_LLM);
  assert.ok(s2.ok);
  // la versión 2 sigue en cola: pagar ahora pintaría con la 1 y, al terminar la 2, repintaría todo
  const early = await payApproved(store, { bookId: s1.bookId, edition: "illustrated" });
  assert.equal(!early.ok && early.error, "sheet_not_ready");
  await paintAll(store, dryRunAdapter, [s2.sheetJobId, s2.coverJobId], { concurrency: 1, deadline: soon() });
  assert.ok((await payApproved(store, { bookId: s1.bookId, edition: "illustrated" })).ok);
  const pages = await requestPages(store, { bookId: s1.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(pages.ok && pages.created === 12);
  const v = await bookView(store, s1.bookId);
  assert.ok(v.ok && v.approvedSheetJobId === s2.sheetJobId, "queda fijada como aprobada");
});

test("«Otra versión» pulsada dos veces a la vez gasta una sola", async () => {
  const { store, bookId } = await paidWithTwoSheets();
  const ask = { bookId, page: 3, reason: "cuerpo" };
  await Promise.all([requestPages(store, ask, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM), requestPages(store, ask, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM)]);
  const v = await bookView(store, bookId);
  assert.ok(v.ok && v.redosLeft === MAX_BOOK_REDOS - 1, `quedan ${v.ok && v.redosLeft}`);
});

test("sin pagar: el cuento entero, escenas incluidas, se sigue pudiendo cambiar", async () => {
  const store = memoryStore(newMemoryState());
  const s = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(s.ok);
  const changed = { ...plan, pages: plan.pages.map((p) => (p.n === 4 ? { ...p, scene: "Vera y Toby cruzan un puente de madera." } : p)) };
  assert.ok((await savePlan(store, { bookId: s.bookId, plan: changed })).ok);
  const v = await bookView(store, s.bookId);
  assert.ok(v.ok && v.plan.pages[3].scene === "Vera y Toby cruzan un puente de madera.");
});

test("las «Otra versión» se cuentan por los motivos del padre, no por versiones pintadas", async () => {
  const { state, store, bookId } = await paidWithTwoSheets();
  // una versión 2 de la página 5 que no pidió el padre (por ejemplo, de una hoja cambiada antes de este arreglo)
  const p5 = [...state.jobs.values()].find((j) => j.kind === "page" && j.page_n === 5)!;
  state.jobs.set("extra", { ...p5, id: "extra", variant: 2, job_key: `${p5.job_key}:x` });
  let v = await bookView(store, bookId);
  assert.ok(v.ok && v.redosLeft === MAX_BOOK_REDOS);
  const r = await requestPages(store, { bookId, page: 3, reason: "cuerpo" }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(r.ok);
  v = await bookView(store, bookId);
  assert.ok(v.ok && v.redosLeft === MAX_BOOK_REDOS - 1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { runJob, v2Of } from "../../lib/generation/service";
import { approveSheet, bookView, payDryRun, requestPages, reviseSheet, savePlan, startBook, MAX_SHEETS } from "../../lib/book/service";
import { coverPrompt, pagePrompt, sheetPrompt, castArt } from "../../lib/plan/art";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { getStyle } from "../../lib/generation/styles";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const email = "vera@example.com";

test("dirección de arte: la hoja lleva al reparto con identidad y ropa; la página cambia solo la ropa", async () => {
  const { art } = await castArt(ficha, plan, MOCK_LLM);
  const style = getStyle("gouache")!;
  const sheet = sheetPrompt(art, style);
  assert.match(sheet, /Vera, a 6-year-old girl/);
  assert.match(sheet, /curly bob auburn hair/);
  assert.match(sheet, /thin round wire glasses/);
  assert.match(sheet, /Toby/);
  assert.match(sheet, /No text/);
  const cover = coverPrompt(art, style);
  assert.match(cover, /upper third/);
  const p1 = plan.pages[0];
  const page = pagePrompt(art, p1, { n: 1, sceneEn: "Vera jumps out of bed", outfitEn: "striped pyjamas", extrasEn: [] }, style);
  assert.match(page, /wearing striped pyjamas \(only the clothes change/);
  assert.doesNotMatch(page, /Toby/, "Toby no sale en la página 1");
});

test("flujo nuevo en memoria: hoja + portada tras el email, cambios con palabras, pago y 12 páginas", async () => {
  const store = memoryStore(newMemoryState());
  const start = await startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  if (!start.ok) return;
  assert.equal(start.created, 2);

  // la portada espera a la hoja
  const early = await runJob(store, start.coverJobId, dryRunAdapter);
  assert.equal(!early.ok && early.status, 409);
  for (const id of [start.sheetJobId, start.coverJobId]) {
    const r = await runJob(store, id, dryRunAdapter);
    assert.ok(r.ok && r.job.status === "done");
  }
  const jobs = await store.listJobs(start.bookId);
  assert.deepEqual(jobs.map((j) => [j.kind, v2Of(j)?.size]), [["sheet", "1K"], ["cover", "2K"]]);

  // repetir el paso 4 con lo mismo no crea nada
  const again = await startBook(store, { bookId: start.bookId, email, ficha, plan }, dryRunAdapter, MOCK_LLM);
  assert.ok(again.ok && again.created === 0 && again.sheetJobId === start.sheetJobId);

  // dos cambios con palabras; el tercero no
  const r1 = await reviseSheet(store, { bookId: start.bookId, instruction: "más rizos" }, dryRunAdapter, MOCK_LLM);
  assert.ok(r1.ok && r1.created === 2);
  const r2 = await reviseSheet(store, { bookId: start.bookId, instruction: "sin pecas" }, dryRunAdapter, MOCK_LLM);
  assert.ok(r2.ok);
  const r3 = await reviseSheet(store, { bookId: start.bookId, instruction: "más alta" }, dryRunAdapter, MOCK_LLM);
  assert.equal(!r3.ok && r3.error, "max_versions");
  assert.equal(MAX_SHEETS, 3);
  const bad = await reviseSheet(store, { bookId: start.bookId, instruction: "con una pistola" }, dryRunAdapter, MOCK_LLM);
  assert.equal(!bad.ok && bad.status, 422);
  if (!r2.ok) return;
  for (const id of [r2.sheetJobId, r2.coverJobId]) await runJob(store, id, dryRunAdapter);
  assert.ok((await approveSheet(store, { bookId: start.bookId, sheetJobId: r2.sheetJobId })).ok);

  // sin pagar no hay páginas
  const unpaid = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.equal(!unpaid.ok && unpaid.error, "not_paid");
  assert.ok((await payDryRun(store, { bookId: start.bookId })).ok);
  const pages = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(pages.ok && pages.created === 12);
  if (!pages.ok) return;
  for (const id of pages.jobs) await runJob(store, id, dryRunAdapter);
  const twice = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(twice.ok && twice.created === 0, "pedir el libro otra vez no repinta");

  // otra versión de la página 3 y después ya no
  const v2 = await requestPages(store, { bookId: start.bookId, page: 3 }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(v2.ok && v2.created === 1);
  await requestPages(store, { bookId: start.bookId, page: 3 }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  const v4 = await requestPages(store, { bookId: start.bookId, page: 3 }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.equal(!v4.ok && v4.error, "max_versions");

  // las páginas usan la hoja aprobada
  const pageJob = (await store.listJobs(start.bookId)).find((j) => j.kind === "page" && j.page_n === 1)!;
  assert.ok(JSON.stringify(pageJob.references).includes(r2.sheetJobId));

  // cambiar el texto de una página no repinta; cambiar la escena sí deja la imagen como «no actual»
  const edited = { ...plan, pages: plan.pages.map((p) => (p.n === 2 ? { ...p, text: `${p.text} Y se rió.` } : p.n === 4 ? { ...p, scene: "Vera y Toby cruzan un puente de madera sobre un río." } : p)) };
  assert.ok((await savePlan(store, { bookId: start.bookId, plan: edited })).ok);
  const view = await bookView(store, start.bookId);
  assert.ok(view.ok);
  if (!view.ok) return;
  assert.equal(view.paid, true);
  assert.equal(view.approvedSheetJobId, r2.sheetJobId);
  const p2 = view.jobs.find((j) => j.kind === "page" && j.page === 2)!;
  const p4 = view.jobs.find((j) => j.kind === "page" && j.page === 4)!;
  assert.equal(p2.current, true);
  assert.equal(p4.current, false);
  const redo = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(redo.ok && redo.created === 1, "solo se repinta la página cuya escena cambió");
});

test("startBook valida email, ficha y plan antes de gastar", async () => {
  const store = memoryStore(newMemoryState());
  assert.equal(((await startBook(store, { email: "no", ficha, plan }, dryRunAdapter, MOCK_LLM)) as { error: string }).error, "email");
  const broken = { ...plan, pages: plan.pages.slice(0, 5) };
  assert.equal(((await startBook(store, { email, ficha, plan: broken }, dryRunAdapter, MOCK_LLM)) as { error: string }).error, "plan");
  const counting = { ...plan, pages: plan.pages.map((p) => (p.n === 1 ? { ...p, scene: "Vera sopla siete velas" } : p)) };
  const r = await startBook(store, { email, ficha, plan: counting }, dryRunAdapter, MOCK_LLM);
  assert.equal(!r.ok && r.error, "plan_invalid");
});

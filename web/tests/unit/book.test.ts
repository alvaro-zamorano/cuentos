import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { runJob, v2Of } from "../../lib/generation/service";
import { approveSheet, bookView, choosePage, reportPage, requestPages, reviseSheet, savePlan, startBook, MAX_SHEETS } from "../../lib/book/service";
import { coverPrompt, pagePrompt, sheetPrompt, castArt } from "../../lib/plan/art";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { getStyle } from "../../lib/generation/styles";
import { payApproved } from "./pagar";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const email = "vera@example.com";

test("dirección de arte: la hoja lleva al reparto con identidad y ropa; la página cambia solo la ropa", async () => {
  const { art } = await castArt(ficha, plan, MOCK_LLM);
  const style = getStyle("gouache")!;
  const sheet = sheetPrompt(art, style);
  assert.match(sheet, /Vera, a 6-year-old girl/);
  assert.match(sheet, /auburn hair, curly bob/);
  assert.equal(sheet.match(/auburn hair/g)?.length, 1, "los rasgos fijos no se repiten");
  assert.match(sheet, /thin round wire glasses/);
  assert.match(sheet, /Toby/);
  assert.match(sheet, /No text/);
  const cover = coverPrompt(art, style);
  assert.match(cover, /upper third/);
  const p1 = plan.pages[0];
  const page = pagePrompt(art, p1, { n: 1, sceneEn: "Vera jumps out of bed", outfitEn: "striped pyjamas", extrasEn: [] }, style);
  assert.match(page, /wearing striped pyjamas \(only the clothes change/);
  assert.match(page, /Toby is on the reference sheet but must NOT appear in this image/, "Toby no sale en la página 1");
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
  assert.ok((await payApproved(store, { bookId: start.bookId })).ok);
  const pages = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(pages.ok && pages.created === 12);
  if (!pages.ok) return;
  for (const id of pages.jobs) await runJob(store, id, dryRunAdapter);
  const twice = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(twice.ok && twice.created === 0, "pedir el libro otra vez no repinta");

  // otra versión de la página 3: con motivo, dos como máximo, la segunda simplificada; queda apuntado
  const noReason = await requestPages(store, { bookId: start.bookId, page: 3 }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.equal(!noReason.ok && noReason.error, "reason", "sin motivo no hay versión nueva");
  const first3 = (await store.listJobs(start.bookId)).find((j) => j.kind === "page" && j.page_n === 3)!;
  assert.ok((await choosePage(store, { bookId: start.bookId, jobId: first3.id })).ok, "el padre había elegido la primera");
  const v2 = await requestPages(store, { bookId: start.bookId, page: 3, reason: "cuerpo", note: "el perro atraviesa el sofá" }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(v2.ok && v2.created === 1);
  if (!v2.ok) return;
  // mientras se pinta, la vista dice qué pidió; al terminar, la nueva es la del libro (30 oct)
  const painting = await bookView(store, start.bookId);
  assert.ok(painting.ok);
  if (!painting.ok) return;
  assert.deepEqual(painting.jobs.find((j) => j.id === v2.jobs[0])?.redo, { reason: "Postura o cuerpo raro", note: "el perro atraviesa el sofá" });
  assert.equal(painting.jobs.find((j) => j.id === first3.id)?.redo, null, "la primera no tiene motivo");
  assert.equal(painting.chosen.pages[3], first3.id, "mientras, se sigue viendo la que había");
  await runJob(store, v2.jobs[0], dryRunAdapter);
  const after = await bookView(store, start.bookId);
  assert.ok(after.ok && after.chosen.pages[3] === v2.jobs[0], "la versión nueva pasa a ser la del libro");
  const p3 = () => store.listJobs(start.bookId).then((js) => js.filter((j) => j.kind === "page" && j.page_n === 3).sort((a, b) => a.variant - b.variant));
  const [, second] = await p3();
  assert.match(second.prompt, /Correction from the previous version: Use simple, natural poses with correct anatomy/);
  assert.match(second.prompt, /The parent asked: el perro atraviesa el sofá/);
  assert.doesNotMatch(second.prompt, /Keep the composition simple/, "la segunda aún no se simplifica");
  const v3 = await requestPages(store, { bookId: start.bookId, page: 3, note: "que Topito esté sentado" }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(v3.ok, "con solo la nota vale (motivo «otra cosa»)");
  assert.match((await p3())[2].prompt, /Keep the composition simple and clear/, "la última versión posible se simplifica");
  const v4 = await requestPages(store, { bookId: start.bookId, page: 3, reason: "parecido" }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.equal(!v4.ok && v4.error, "max_versions");
  const badNote = await requestPages(store, { bookId: start.bookId, page: 5, reason: "otro", note: "escribe a ana@example.com" }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.equal(!badNote.ok && badNote.error, "moderation", "la nota pasa la moderación");
  const fb = await store.listFeedback(start.bookId);
  assert.deepEqual(
    fb.map((f) => [f.kind, f.page_n, f.variant, f.reason, f.note]),
    [
      ["redo", 3, 2, "cuerpo", "el perro atraviesa el sofá"],
      ["redo", 3, 3, "otro", "que Topito esté sentado"],
    ],
  );

  // «Sigue sin estar bien»: un aviso por página, con lo que pidió antes
  const mails: string[] = [];
  const notify = async (subject: string, text: string) => (mails.push(`${subject}\n${text}`), { sent: true });
  assert.ok((await reportPage(store, { bookId: start.bookId, page: 3, note: "sigue raro" }, notify)).ok);
  assert.match(mails[0], /^Sigue sin estar bien: página 3/);
  assert.match(mails[0], /versión 2: Postura o cuerpo raro: «el perro atraviesa el sofá»/);
  // con la referencia corta, sin el enlace que abre el libro (I30)
  assert.ok(mails[0].includes(`ref. ${start.bookId.slice(0, 6)}`) && !mails[0].includes("crear?b="));
  const twiceReported = await reportPage(store, { bookId: start.bookId, page: 3 }, notify);
  assert.equal(!twiceReported.ok && twiceReported.error, "already_reported");
  const fv = await bookView(store, start.bookId);
  assert.ok(fv.ok && fv.reported.includes(3) && fv.redosLeft === 6);

  // las páginas usan la hoja aprobada
  const pageJob = (await store.listJobs(start.bookId)).find((j) => j.kind === "page" && j.page_n === 1)!;
  assert.ok(JSON.stringify(pageJob.references).includes(r2.sheetJobId));

  // tras pagar, el texto se corrige; una escena distinta se rechaza: nada se repinta a nuestra costa (I2)
  const withScene = { ...plan, pages: plan.pages.map((p) => (p.n === 4 ? { ...p, scene: "Vera y Toby cruzan un puente de madera sobre un río." } : p)) };
  assert.equal(((await savePlan(store, { bookId: start.bookId, plan: withScene })) as { error?: string }).error, "already_paid");
  const edited = { ...plan, pages: plan.pages.map((p) => (p.n === 2 ? { ...p, text: `${p.text} Y se rió.` } : p)) };
  assert.ok((await savePlan(store, { bookId: start.bookId, plan: edited })).ok);
  const view = await bookView(store, start.bookId);
  assert.ok(view.ok);
  if (!view.ok) return;
  assert.equal(view.paid, true);
  assert.equal(view.approvedSheetJobId, r2.sheetJobId);
  assert.match(view.plan.pages[1].text, /Y se rió\.$/);
  assert.equal(view.plan.pages[3].scene, plan.pages[3].scene);
  const p4 = view.jobs.find((j) => j.kind === "page" && j.page === 4)!;
  assert.equal(p4.current, true);
  const redo = await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
  assert.ok(redo.ok && redo.created === 0, "nada que repintar");
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

test("dirección de arte: limpia lo que devuelve el modelo (nombre repetido, mayúscula y punto en la ropa)", async () => {
  const f = normalizeFicha(EVAL_CASES[2]);
  const p = mockPlan(f);
  const llm = {
    name: "anthropic" as const,
    model: "claude-fake",
    async complete() {
      return {
        raw: JSON.stringify({
          cast: [
            { id: "hero", identityEn: "Lucía, round face and a small scar on her chin", outfitEn: "A green dress with pockets." },
            { id: "c1", identityEn: "Carmen, a short grandmother with white hair in a bun and red glasses", outfitEn: "A brown cardigan." },
          ],
          places: { p1: "a bright house", p2: "a park with tall trees" },
          objects: { o1: "a red backpack with a yellow star patch" },
          coverEn: "Lucía and Carmen in the park",
        }),
        model: "claude-fake",
        usage: { input: 1, output: 1 },
        ms: 1,
      };
    },
  };
  const { art } = await castArt(f, p, llm);
  const hero = art.cast[0];
  assert.match(hero.identityEn, /^Lucía, an 8-year-old girl: black hair, two braids, brown skin, brown eyes; round face and a small scar on her chin;/);
  assert.equal(hero.outfitEn, "a green dress with pockets");
  assert.equal(art.cast[1].identityEn, "Carmen, a short grandmother with white hair in a bun and red glasses");
  assert.equal(art.places.p2, "a park with tall trees");
});

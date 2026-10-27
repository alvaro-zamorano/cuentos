/**
 * El PDF se pinta una vez, se guarda en el bucket y se descarga con una URL firmada (auditoría 26 oct, I10). Dos
 * peticiones a la vez comparten el trabajo, los Chromium van de uno en uno y lo que falla no cuenta en el límite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState, type GenStore } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { payDryRun, pendingPageJobs, requestPages, startBook } from "../../lib/book/service";
import { bookPdf, pdfKey, type PdfDeps } from "../../lib/book/pdf";
import { oneAtATime, QueueBusy } from "../../lib/pdf/queue";
import { rateLimit } from "../../lib/rateLimit";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const PDF = new Uint8Array([37, 80, 68, 70]);

async function paidBook(edition: "illustrated" | "hardcover" = "illustrated") {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  assert.ok((await payDryRun(store, { bookId: start.bookId, edition, ...(edition === "hardcover" ? { shipping: { name: "Ana García", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" } } : {}) })).ok);
  assert.ok((await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM)).ok);
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, start.bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
  return { state, store, bookId: start.bookId };
}

/** El almacén en memoria con un bucket de mentira, como Supabase: guarda, dice si existe y firma con el nombre. */
function withBucket(store: GenStore) {
  const files = new Map<string, Uint8Array>();
  const signed: { path: string; download?: string }[] = [];
  const s: GenStore = {
    ...store,
    mode: "supabase",
    async upload(path, data) {
      files.set(path, data);
    },
    async exists(path) {
      return files.has(path);
    },
    async signedUrl(path, _seconds, opts) {
      if (!files.has(path)) return null;
      signed.push({ path, download: opts?.download });
      return `https://bucket/${path}?download=${opts?.download ?? ""}`;
    },
  };
  return { s, files, signed };
}

function counting(fail = false) {
  let renders = 0;
  const deps: PdfDeps = {
    render: async () => {
      renders++;
      await new Promise((r) => setTimeout(r, 30));
      if (fail) throw new Error("Task timed out");
      return PDF;
    },
  };
  return { deps, renders: () => renders };
}

test("I10: el PDF se pinta una vez y se guarda en la carpeta del libro; la segunda descarga es solo una URL firmada", async () => {
  const { store, bookId } = await paidBook();
  const { s, files, signed } = withBucket(store);
  const c = counting();
  const a = await bookPdf(s, bookId, "full", c.deps);
  assert.ok(a.ok && "url" in a, JSON.stringify(a));
  assert.equal(c.renders(), 1);
  const [path] = [...files.keys()];
  const book = await store.findBook({ publicId: bookId });
  assert.match(path, new RegExp(`^books/${book!.id}/descarga-full-[0-9a-f]{20}\\.pdf$`), "en la carpeta que vacía el borrado");
  assert.equal(signed[0].download, "cuento-" + ficha.hero.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() + "-ilustrado.pdf");
  const b = await bookPdf(s, bookId, "full", c.deps);
  assert.ok(b.ok && "url" in b);
  assert.equal(c.renders(), 1, "no se vuelve a pintar");
  assert.equal(files.size, 1);
});

test("I10: si cambia lo que sale en el PDF, se pinta otro", async () => {
  const { state, store, bookId } = await paidBook();
  const { s, files } = withBucket(store);
  const c = counting();
  assert.ok((await bookPdf(s, bookId, "full", c.deps)).ok);
  // otro título (el padre corrige el texto): el PDF ya no es el mismo
  const raw = state.books.get(bookId)!.raw as { plan: { title: string } };
  raw.plan.title = "Otro título";
  assert.ok((await bookPdf(s, bookId, "full", c.deps)).ok);
  assert.equal(c.renders(), 2);
  assert.equal(files.size, 2);
  // y el gratis es otro archivo
  assert.ok((await bookPdf(s, bookId, "free", c.deps)).ok);
  assert.equal(files.size, 3);
});

test("I10: la huella es la maqueta con las imágenes por job: no cambia con las URL firmadas ni con un despliegue, sí con el contenido", () => {
  const pages: Record<number, string | null> = {};
  for (let n = 1; n <= 12; n++) pages[n] = `p${n}`;
  const view = { plan, ficha, chosen: { sheet: "s", cover: "c", pages, portraits: [] } };
  const k = pdfKey(view, "full");
  assert.equal(pdfKey(JSON.parse(JSON.stringify(view)), "full"), k);
  assert.notEqual(pdfKey(view, "free"), k);
  assert.notEqual(pdfKey({ ...view, chosen: { ...view.chosen, pages: { ...pages, 3: "otra" } } }, "full"), k, "otra versión de una página");
  assert.notEqual(pdfKey({ ...view, plan: { ...plan, title: "Otro título" } }, "full"), k);
  assert.notEqual(pdfKey({ ...view, ficha: { ...ficha, from: "Con cariño, la abuela" } }, "full"), k);
});

test("revisión: el PDF gratis tampoco se guarda sin portada si su URL no se pudo firmar", async () => {
  const { state, store, bookId } = await paidBook();
  const { s, files } = withBucket(store);
  // la portada está en Storage, pero la firma no sale
  const cover = [...state.jobs.values()].find((j) => j.kind === "cover" && j.status === "done")!;
  cover.storage_path = "books/x/portada.jpg";
  const c = counting();
  const r = await bookPdf(s, bookId, "free", c.deps);
  assert.ok(!r.ok && r.status === 503 && r.error === "render_failed", JSON.stringify(r));
  assert.equal(c.renders(), 0);
  assert.equal(files.size, 0, "nada guardado");
});

test("revisión: si el turno de Chromium no llega a tiempo, 503 «ocupado» en castellano y sin gastar el límite", async () => {
  const { store, bookId } = await paidBook();
  const ip = `pdf2:busy-${Math.random()}`;
  const blocker = oneAtATime(() => new Promise((r) => setTimeout(r, 300)));
  const deps = { render: () => oneAtATime(async () => PDF, { maxWaitMs: 50 }), allowRender: () => rateLimit(ip, 1, 0) };
  const r = await bookPdf(store, bookId, "full", deps);
  assert.ok(!r.ok && r.error === "pdf_busy" && /otros PDF/.test(r.reason ?? ""), JSON.stringify(r));
  await blocker;
  // el turno se devolvió: con el límite en 1, la siguiente pasa
  assert.ok((await bookPdf(store, bookId, "full", deps)).ok);
});

test("I10: dos descargas a la vez del mismo PDF comparten el pintado", async () => {
  const { store, bookId } = await paidBook();
  const { s } = withBucket(store);
  const c = counting();
  const [a, b] = await Promise.all([bookPdf(s, bookId, "full", c.deps), bookPdf(s, bookId, "full", c.deps)]);
  assert.ok(a.ok && b.ok);
  assert.equal(c.renders(), 1);
});

test("I10: sin bucket (en memoria) se descargan los bytes, y no se intenta guardar", async () => {
  const { store, bookId } = await paidBook();
  const c = counting();
  const r = await bookPdf(store, bookId, "full", c.deps);
  assert.ok(r.ok && "pdf" in r, JSON.stringify(r));
  assert.deepEqual([...r.pdf], [...PDF]);
});

test("I10: si no se puede guardar, se descarga igual", async () => {
  const { store, bookId } = await paidBook();
  const { s } = withBucket(store);
  s.upload = async () => {
    throw new Error("storage: 500");
  };
  const r = await bookPdf(s, bookId, "full", counting().deps);
  assert.ok(r.ok && "pdf" in r);
});

test("I10: lo que falla no cuenta en el límite por IP, y el mensaje sale en castellano", async () => {
  const { store, bookId } = await paidBook();
  const { s } = withBucket(store);
  const ip = `pdf2:test-${Math.random()}`;
  const c = counting(true);
  const deps = { ...c.deps, allowRender: () => rateLimit(ip, 2, 0) };
  for (let i = 0; i < 4; i++) {
    const r = await bookPdf(s, bookId, "full", deps);
    assert.ok(!r.ok && r.status === 503 && r.error === "render_failed", JSON.stringify(r));
    assert.match(r.reason ?? "", /No hemos podido preparar el PDF/);
  }
  assert.equal(c.renders(), 4, "cuatro fallos y sigue pudiendo pedirlo");
  // con el límite gastado de verdad: 429 sin pintar
  const ok = { render: async () => PDF, allowRender: () => rateLimit(ip, 2, 0) };
  assert.ok((await bookPdf(s, bookId, "free", ok)).ok);
  assert.ok((await bookPdf(s, bookId, "full", ok)).ok);
  const third = await bookPdf(s, bookId, "free", { ...ok, render: async () => new Uint8Array([1]) });
  assert.ok(third.ok, "ya está hecho: no pasa por el límite");
  s.exists = async () => false;
  const limited = await bookPdf(s, bookId, "full", ok);
  assert.ok(!limited.ok && limited.status === 429 && /muchos PDF/.test(limited.reason ?? ""), JSON.stringify(limited));
});

test("I10: sin pagar o con páginas por pintar, no se pinta nada", async () => {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  const c = counting();
  const unpaid = await bookPdf(store, start.bookId, "full", c.deps);
  assert.ok(!unpaid.ok && unpaid.status === 402);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  assert.ok((await payDryRun(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  const missing = await bookPdf(store, start.bookId, "full", c.deps);
  assert.ok(!missing.ok && missing.status === 409 && missing.error === "pages_missing" && (missing.pages?.length ?? 0) > 0, JSON.stringify(missing));
  assert.equal(c.renders(), 0);
  const gone = await bookPdf(store, "zzzzzzzz", "full", c.deps);
  assert.ok(!gone.ok && gone.status === 404 && /30 días/.test(gone.reason ?? ""));
});

test("I10: los Chromium van de uno en uno, y uno que falla no para la cola", async () => {
  let running = 0;
  let max = 0;
  const task = (ms: number, fail = false) =>
    oneAtATime(async () => {
      running++;
      max = Math.max(max, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      if (fail) throw new Error("x");
      return ms;
    });
  const results = await Promise.allSettled([task(40), task(10, true), task(20), task(5)]);
  assert.equal(max, 1);
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled", "rejected", "fulfilled", "fulfilled"],
  );
});

test("revisión: quien se rinde en la cola no se pinta después, y la cola sigue", async () => {
  const order: string[] = [];
  const long = oneAtATime(async () => {
    await new Promise((r) => setTimeout(r, 120));
    order.push("largo");
  });
  const quitter = oneAtATime(async () => void order.push("no debería"), { maxWaitMs: 30 });
  const after = oneAtATime(async () => void order.push("siguiente"));
  await assert.rejects(quitter, QueueBusy);
  await long;
  await after;
  assert.deepEqual(order, ["largo", "siguiente"]);
});

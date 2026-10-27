/**
 * El PDF, y sobre todo el de la imprenta, no sale con huecos ni con otra letra (auditoría 26 oct, I8). Los casos con
 * Chromium usan el de Playwright y se saltan si no está instalado. Sin red: las letras van dentro del HTML.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import puppeteer from "puppeteer-core";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, pendingPageJobs, requestPages, startBook, unsignedImages } from "../../lib/book/service";
import { completePrint, startPrint, type PrintDeps } from "../../lib/book/print";
import { estimatedCover } from "../../lib/print/gelato";
import { pdfBookHtml, type PrintBookInput } from "../../lib/pdf/printHtml";
import { readyToPrint } from "../../lib/pdf/ready";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { payApproved } from "./pagar";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" };

async function paidHardcoverPainted() {
  const state = newMemoryState();
  const store = memoryStore(state);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  assert.ok((await payApproved(store, { bookId: start.bookId, edition: "hardcover", shipping: ADDRESS })).ok);
  assert.ok((await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM)).ok);
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, start.bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
  return { state, store, bookId: start.bookId };
}

test("una ilustración pintada que llega sin URL (falla la firma) no se manda a la imprenta", async () => {
  const { state, store, bookId } = await paidHardcoverPainted();
  let v = await bookView(store, bookId);
  assert.ok(v.ok);
  assert.deepEqual(unsignedImages(v), [], "las del modo sin coste no tienen imagen y no cuentan");
  // la página 7 está en Storage, pero la URL firmada no sale (el almacén en memoria nunca firma)
  const p7 = [...state.jobs.values()].find((j) => j.kind === "page" && j.page_n === 7)!;
  p7.storage_path = "cuentos/libro/p7.jpg";
  v = await bookView(store, bookId);
  assert.ok(v.ok);
  assert.deepEqual(unsignedImages(v), ["página 7"]);

  let rendered = 0;
  const deps: PrintDeps = {
    mode: "dry-run",
    orderType: "draft",
    pageCount: 30,
    resolveProductUid: async () => "uid",
    productSize: async () => ({ trimWidth: 280, trimHeight: 210, bleed: 4 }),
    coverGeometry: async () => estimatedCover(),
    estimatedCover,
    render: async () => (rendered++, new Uint8Array([37, 80, 68, 70])),
    upload: async () => "https://files/x.pdf",
    createOrder: async () => ({ id: "g1" }),
    getOrder: async () => null,
    mail: { sentToPrint: async () => ({ sent: true }), shipped: async () => ({ sent: true }), reminder: async () => ({ sent: true }) },
    link: (id: string) => id,
    trackLink: (id: string) => id,
  } as unknown as PrintDeps;
  const s = await startPrint(store, bookId, "dry-run");
  assert.ok(s.ok);
  const r = await completePrint(store, s.orderId, deps);
  assert.ok(!r.ok && /imagenes_sin_url: página 7/.test(r.reason ?? ""), JSON.stringify(r));
  assert.equal(rendered, 0, "ni se maqueta");
});

const chrome = (() => {
  try {
    const p = chromium.executablePath();
    return fs.existsSync(p) ? p : null;
  } catch {
    return null;
  }
})();
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const input = (pageUrl: (n: number) => string | null): PrintBookInput => ({
  plan,
  heroName: "Vera",
  coverUrl: PIXEL,
  sheetUrl: PIXEL,
  portraits: [],
  pageUrls: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, pageUrl(i + 1)])),
  date: new Date(),
});

test("con Chromium: una imagen que no carga hace fallar el PDF en vez de dejar la página en blanco", { skip: !chrome && "sin Chromium" }, async () => {
  const browser = await puppeteer.launch({ executablePath: chrome!, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    // la página 7 apunta a un servidor que no existe: el navegador la da por fallida enseguida
    await page.setContent(pdfBookHtml(input((n) => (n === 7 ? "http://127.0.0.1:9/p7.jpg" : PIXEL)), "full").html, { waitUntil: "load", timeout: 30_000 });
    await assert.rejects(readyToPrint(page, 15_000), /1 imagen sin cargar/);
  } finally {
    await browser.close();
  }
});

const pdffonts = !spawnSync("pdffonts", ["-v"]).error;

test("con Chromium y sin red: el PDF lleva Lora y Figtree dentro", { skip: (!chrome && "sin Chromium") || (!pdffonts && "sin pdffonts (poppler)") }, async () => {
  const browser = await puppeteer.launch({ executablePath: chrome!, headless: true, args: ["--no-sandbox"] });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pdf-")), "libro.pdf");
  try {
    const page = await browser.newPage();
    // sin red: cualquier petición fuera del HTML falla (como si Google Fonts no respondiera)
    await page.setRequestInterception(true);
    page.on("request", (r) => (r.url().startsWith("data:") ? r.continue() : r.abort()));
    await page.setContent(pdfBookHtml(input(() => PIXEL), "full").html, { waitUntil: "load", timeout: 30_000 });
    await readyToPrint(page, 15_000);
    fs.writeFileSync(file, await page.pdf({ width: "297mm", height: "210mm", printBackground: true }));
  } finally {
    await browser.close();
  }
  const fonts = execFileSync("pdffonts", [file]).toString();
  assert.match(fonts, /Lora/);
  assert.match(fonts, /Figtree/);
});

test("página de personajes: un retrato sin URL cuenta como hueco, y la hoja solo cuando es la que se usa (revisión 27 oct)", () => {
  type V = Parameters<typeof unsignedImages>[0];
  const job = (id: string, url: string | null, placeholder = false) => ({ id, status: "done", url, placeholder }) as V["jobs"][number];
  const pages = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, `p${i + 1}`]));
  const base = [job("cover", "u"), ...Array.from({ length: 12 }, (_, i) => job(`p${i + 1}`, "u"))];
  const view = (jobs: V["jobs"], portraits: V["chosen"]["portraits"]): V => ({ jobs, chosen: { cover: "cover", sheet: "sheet", pages, portraits } });

  // retratos con URL: la hoja no se usa y da igual que no tenga
  assert.deepEqual(unsignedImages(view([...base, job("sheet", null), job("r1", "u")], [{ name: "Vera", job: "r1" }])), []);
  // un retrato sin URL: hueco (el libro pasaría a la hoja sin avisar) y, si la hoja tampoco tiene, también la hoja
  assert.deepEqual(unsignedImages(view([...base, job("sheet", "u"), job("r1", null)], [{ name: "Vera", job: "r1" }])), ["retrato de Vera"]);
  assert.deepEqual(unsignedImages(view([...base, job("sheet", null), job("r1", null)], [{ name: "Vera", job: "r1" }])), ["retrato de Vera", "hoja de personajes"]);
  // sin retratos encargados, la hoja es la página de personajes
  assert.deepEqual(unsignedImages(view([...base, job("sheet", null)], [])), ["hoja de personajes"]);
  // modo sin coste: no cuentan, salvo en un pedido real a la imprenta (saldrían en blanco)
  const free = view([...base.map((j) => (j.id === "p3" ? job("p3", null, true) : j)), job("sheet", "u")], []);
  assert.deepEqual(unsignedImages(free), []);
  assert.deepEqual(unsignedImages(free, { placeholders: true }), ["página 3"]);
});

/**
 * Menores de la auditoría del 26 oct e I30: los avisos a soporte no abren el libro, el asunto del correo entrante va en
 * una línea, el título no lleva datos de contacto, los precios salen de los céntimos y el navegador olvida a los 30 días.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter, type GenerationAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { alertPaidFailures, payDryRun, paymentNotice, pendingPageJobs, reportPage, requestPages, startBook } from "../../lib/book/service";
import { bookRef } from "../../lib/support";
import { forwardPlan } from "../../lib/inbound";
import { validatePlan } from "../../lib/plan/validate";
import { PRICE_HARDCOVER, PRICE_ILLUSTRATED } from "../../lib/pricing";
import { PRICE_CENTS, eur } from "../../lib/print/prices";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const soon = () => Date.now() + 60_000;
const refuses: GenerationAdapter = { ...dryRunAdapter, generateImage: async () => Promise.reject(new Error("gemini sin imagen (IMAGE_SAFETY)")) };

async function paidBook() {
  const store = memoryStore(newMemoryState());
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: soon() });
  assert.ok((await payDryRun(store, { bookId: start.bookId, edition: "illustrated" })).ok);
  return { store, bookId: start.bookId };
}

const opensBook = (text: string, publicId: string) => text.includes("crear?b=") || text.includes(publicId);

test("I30: los avisos a soporte nombran el libro con una referencia corta, sin el enlace ni el id entero", async () => {
  const { store, bookId } = await paidBook();
  assert.equal(bookRef(bookId), `ref. ${bookId.slice(0, 6)}`);
  // «Avísanos» de una página
  const texts: string[] = [];
  const notify = async (subject: string, text: string) => (texts.push(`${subject}\n${text}`), { sent: true });
  assert.ok((await reportPage(store, { bookId, page: 3, note: "no carga" }, notify)).ok);
  // una página pagada que ya no sale
  for (let round = 0; round < 8; round++) {
    const r = await requestPages(store, { bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM);
    assert.ok(r.ok);
    await paintAll(store, refuses, await pendingPageJobs(store, bookId), { concurrency: 4, deadline: soon() });
  }
  assert.equal(await alertPaidFailures(store, bookId, notify), true);
  // un cobro sin registrar
  const pay = paymentNotice({ action: "ignored", reason: "libro caducado" }, { type: "checkout.session.completed", data: { object: { id: "cs_test_1", payment_status: "paid", amount_total: 1490, currency: "eur", metadata: { bookId } } } });
  assert.ok(pay);
  texts.push(pay.text);
  assert.equal(texts.length, 3);
  for (const t of texts) {
    assert.equal(opensBook(t, bookId), false, t);
    assert.ok(t.includes(bookRef(bookId)), t);
  }
});

test("el asunto del correo entrante se reenvía en una línea", () => {
  const env = { MAIL_FORWARD_TO: "soporte@ejemplo.es", MAIL_FROM: "Érase su vez <hola@erasesuvez.com>" };
  const plan = forwardPlan({ id: "e1", from: "Ana <ana@ejemplo.com>", to: ["hola@erasesuvez.com"], subject: "Hola\r\nBcc: otro@ejemplo.com\n\tadiós", text: "x" }, [], env);
  assert.ok("body" in plan);
  assert.equal(plan.body.subject, "Hola Bcc: otro@ejemplo.com adiós");
  const long = forwardPlan({ id: "e2", from: "ana@ejemplo.com", to: ["hola@erasesuvez.com"], subject: "a".repeat(400), text: "x" }, [], env);
  assert.ok("body" in long && String(long.body.subject).length === 250);
});

test("el título del cuento no admite teléfonos, enlaces ni emails (va en el asunto de los emails)", () => {
  for (const title of ["Llama al 600 123 456 para recibirlo", "Vera en www.ejemplo.com", "Escribe a vera@ejemplo.com"]) {
    const v = validatePlan({ ...plan, title }, ficha, { fromParent: true });
    assert.equal(v.usable, false, title);
    assert.ok(v.issues.some((i) => i.hard && i.parent === "El título no puede llevar un email, un enlace ni un teléfono."), title);
  }
  assert.equal(validatePlan(plan, ficha, { fromParent: true }).issues.some((i) => /contacto/.test(i.msg)), false);
});

test("el precio que se enseña sale de los céntimos que se cobran", () => {
  assert.equal(PRICE_ILLUSTRATED, eur(PRICE_CENTS.illustrated));
  assert.equal(PRICE_HARDCOVER, eur(PRICE_CENTS.hardcover));
  assert.equal(PRICE_ILLUSTRATED, "14,90 €");
});

test("el navegador olvida la ficha, el cuento y el email a los 30 días sin tocarlos", async () => {
  const data = new Map<string, string>();
  const g = globalThis as unknown as { localStorage?: unknown };
  const before = g.localStorage;
  g.localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  try {
    const old = Date.now() - 31 * 24 * 3600 * 1000;
    data.set("cuentos:crear:v2", JSON.stringify({ v: 2, step: 4, ficha, bookId: "abcd2345ef", email: "vera@example.com", savedAt: old }));
    const { getCrear, setCrear } = await import("../../lib/crearStore");
    const s = getCrear();
    assert.equal(s.step, 1);
    assert.equal(s.email, undefined);
    assert.equal(data.has("cuentos:crear:v2"), false, "y se borra");
    // al guardar lleva la fecha
    setCrear((cur) => ({ ...cur, email: "vera@example.com" }));
    const saved = JSON.parse(data.get("cuentos:crear:v2")!) as { savedAt: number };
    assert.ok(Date.now() - saved.savedAt < 5_000);
  } finally {
    g.localStorage = before;
  }
});

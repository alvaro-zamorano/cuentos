/**
 * Emails sin repetir ni perder (auditoría 26 oct, menores): el mismo email dos veces en 24 horas sale una vez (clave de
 * idempotencia de Resend), y «ya está en la imprenta» se reintenta desde el cron si Resend falla. Sin red: fetch de
 * mentira que hace de Resend.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mailKey, sendShipped, transientMailFailure } from "../../lib/mail";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState, type GenStore } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { payDryRun, pendingPageJobs, requestPages, startBook } from "../../lib/book/service";
import { completePrint, printCron, startPrint, type PrintDeps } from "../../lib/book/print";
import { estimatedCover } from "../../lib/print/gelato";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

/** Resend de mentira: guarda las claves y, como el de verdad, no repite un email con una clave ya mandada. */
async function withResend<T>(answer: (key: string, seen: Set<string>) => Response, run: (sent: string[]) => Promise<T>): Promise<T> {
  const prev = { fetch: globalThis.fetch, key: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM };
  const seen = new Set<string>();
  const sent: string[] = [];
  process.env.RESEND_API_KEY = "re_prueba";
  process.env.MAIL_FROM = "Érase su vez <hola@erasesuvez.com>";
  globalThis.fetch = (async (_u: string | URL | Request, init?: RequestInit) => {
    const key = new Headers(init?.headers).get("idempotency-key") ?? "";
    const res = answer(key, seen);
    // sin clave, Resend manda siempre
    if (res.ok && (!key || !seen.has(key))) {
      if (key) seen.add(key);
      sent.push(JSON.parse(String(init?.body)).subject);
    }
    return res;
  }) as typeof fetch;
  try {
    return await run(sent);
  } finally {
    globalThis.fetch = prev.fetch;
    if (prev.key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prev.key;
    if (prev.from === undefined) delete process.env.MAIL_FROM;
    else process.env.MAIL_FROM = prev.from;
  }
}
const ok = () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 });

test("la clave es la del email: mismo destinatario, asunto y texto, misma clave; cualquier cambio, otra", () => {
  const k = mailKey("Ana@Example.com ", "Asunto", "Texto");
  assert.equal(k, mailKey("ana@example.com", "Asunto", "Texto"));
  assert.notEqual(k, mailKey("ana@example.com", "Asunto", "Otro texto"));
  assert.notEqual(k, mailKey("ana@example.com", "Otro asunto", "Texto"));
  assert.notEqual(k, mailKey("luis@example.com", "Asunto", "Texto"));
  assert.ok(k.length <= 256, "Resend admite hasta 256");
});

test("dos «va de camino» a la vez (los dos avisos de Gelato) salen una vez; el segundo no se apunta como mandado si el primero sigue en curso", async () => {
  await withResend(
    () => ok(),
    async (sent) => {
      const [a, b] = await Promise.all([sendShipped("ana@example.com", "La luna", "https://x/seguimiento/1"), sendShipped("ana@example.com", "La luna", "https://x/seguimiento/1")]);
      assert.ok(a.sent && b.sent);
      assert.deepEqual(sent, ["«La luna» va de camino"], "una sola vez");
    },
  );
  // Resend responde 409 mientras el primero no ha terminado
  await withResend(
    () => new Response(JSON.stringify({ name: "concurrent_idempotent_requests" }), { status: 409 }),
    async () => assert.deepEqual(await sendShipped("ana@example.com", "La luna", "https://x/s/1"), { sent: false, reason: "en_curso" }),
  );
  // con la misma clave y otro contenido (ya mandado): se da por mandado
  await withResend(
    () => new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 }),
    async () => assert.deepEqual(await sendShipped("ana@example.com", "La luna", "https://x/s/1"), { sent: true }),
  );
});

test("qué fallos se reintentan: red y Resend caído o saturado, no una dirección rechazada ni el correo sin configurar", () => {
  for (const reason of ["red", "error", "resend_429", "resend_500", "resend_503"]) assert.equal(transientMailFailure({ sent: false, reason }), true, reason);
  for (const reason of ["resend_422", "resend_403", "sin_configurar", "sin_destino", "en_curso"]) assert.equal(transientMailFailure({ sent: false, reason }), false, reason);
  assert.equal(transientMailFailure({ sent: true }), false);
});

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid" };

async function readyBook() {
  const plain = memoryStore(newMemoryState());
  const store: GenStore = { ...plain, signedUrl: async (p: string) => `https://files.example/${p}` };
  const start = await startBook(store, { email: "vera@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  await payDryRun(store, { bookId: start.bookId, edition: "hardcover", shipping: ADDRESS });
  assert.ok((await requestPages(store, { bookId: start.bookId }, dryRunAdapter, { dryRunPayment: false }, MOCK_LLM)).ok);
  await paintAll(store, dryRunAdapter, await pendingPageJobs(store, start.bookId), { concurrency: 3, deadline: Date.now() + 30_000 });
  for (const j of await store.listJobs((await store.findBook({ publicId: start.bookId }))!.id)) if (j.status === "done") await store.updateJob(j.id, { storage_path: `books/x/${j.id}.png` });
  return { store, bookId: start.bookId };
}

function deps(sentToPrint: PrintDeps["mail"]["sentToPrint"], now = () => new Date()): PrintDeps {
  return {
    mode: "gelato",
    orderType: "draft",
    pageCount: 30,
    resolveProductUid: async () => "photobooks-hardcover_x",
    productSize: async () => ({ trimWidth: 280, trimHeight: 210, bleed: 4 }),
    coverGeometry: async () => estimatedCover(),
    estimatedCover,
    render: async () => new Uint8Array([37, 80, 68, 70]),
    createOrder: async (i) => ({ id: "gel-1-abcdef", status: "created", orderReferenceId: i.orderReferenceId, trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null }),
    getOrder: async () => null,
    findOrders: async () => [],
    mail: { sentToPrint, shipped: async () => ({ sent: true }), reminder: async () => ({ sent: true }) },
    link: (id) => `https://www.erasesuvez.com/crear?b=${id}`,
    trackLink: (id) => `https://www.erasesuvez.com/seguimiento/${id}`,
    notify: async () => ({ sent: true }),
    now,
  };
}

test("«ya está en la imprenta» que no sale por un fallo pasajero se reintenta desde el cron, una vez; uno rechazado no", async () => {
  const { store, bookId } = await readyBook();
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  let attempts = 0;
  const down = deps(async () => (attempts++, { sent: false, reason: "resend_503" }));
  assert.ok((await completePrint(store, s.orderId, down)).ok);
  assert.equal((await store.getOrderById(s.orderId))?.info?.sentMailPending, true, "apuntado para reintentar");
  // el cron, con Resend ya bien: lo manda y lo desapunta
  const mails: string[] = [];
  const up = deps(async (to) => (mails.push(to), { sent: true }));
  assert.equal((await printCron(store, up)).remailed, 1);
  assert.deepEqual(mails, ["vera@example.com"]);
  assert.equal((await store.getOrderById(s.orderId))?.info?.sentMailPending ?? null, null);
  assert.equal((await printCron(store, up)).remailed, 0, "no se repite");
  assert.equal(attempts, 1);

  // una dirección que Resend rechaza no se reintenta cada día
  const other = await readyBook();
  const s2 = await startPrint(other.store, other.bookId, "gelato", {});
  assert.ok(s2.ok);
  assert.ok((await completePrint(other.store, s2.orderId, deps(async () => ({ sent: false, reason: "resend_422" })))).ok);
  assert.equal((await other.store.getOrderById(s2.orderId))?.info?.sentMailPending ?? null, null);
});

test("pasada una semana desde que salió, el cron ya no reintenta «ya está en la imprenta»", async () => {
  const { store, bookId } = await readyBook();
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  assert.ok((await completePrint(store, s.orderId, deps(async () => ({ sent: false, reason: "red" })))).ok);
  const later = () => new Date(Date.now() + 8 * 24 * 3600_000);
  assert.equal((await printCron(store, deps(async () => ({ sent: true }), later))).remailed, 0);
});

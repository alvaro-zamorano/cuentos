/**
 * Emails sin repetir ni perder (auditoría 26 oct, menores): el aviso de un mismo hecho dos veces en 24 horas sale una vez
 * (clave de idempotencia de Resend, puesta por quien manda), un email que el padre vuelve a pedir sí sale, y «ya está en
 * la imprenta» queda pendiente hasta que sale (el cron lo reintenta si Resend falla). Sin red: fetch de mentira que hace
 * de Resend.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { mailKey, mailSettled, sendBookReady, sendShipped, sendSupportNotice, sendYourBooks, transientMailFailure } from "../../lib/mail";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState, supabaseStore, type GenStore } from "../../lib/generation/store";
import type { Database } from "../../lib/supabase/types";
import { paintAll } from "../../lib/book/background";
import { notifyBookReady, payDryRun, pendingPageJobs, requestPages, startBook } from "../../lib/book/service";
import { completePrint, printCron, refreshPrint, startPrint, type PrintDeps } from "../../lib/book/print";
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

test("la clave es la del hecho y el destinatario: el mismo hecho, la misma clave; otro hecho u otro buzón, otra", () => {
  const k = mailKey("camino:o1:g1", "Ana@Example.com ");
  assert.equal(k, mailKey("camino:o1:g1", "ana@example.com"));
  assert.notEqual(k, mailKey("camino:o2:g1", "ana@example.com"));
  assert.notEqual(k, mailKey("camino:o1:g1", "luis@example.com"));
  assert.ok(k.length <= 256, "Resend admite hasta 256");
});

test("dos «va de camino» del mismo pedido a la vez (los dos avisos de Gelato) salen una vez; el segundo no se apunta como mandado si el primero sigue en curso", async () => {
  await withResend(
    () => ok(),
    async (sent) => {
      const [a, b] = await Promise.all([
        sendShipped("ana@example.com", "La luna", "https://x/seguimiento/1", "camino:o1:g1"),
        sendShipped("ana@example.com", "La luna", "https://x/seguimiento/1", "camino:o1:g1"),
      ]);
      assert.ok(a.sent && b.sent);
      assert.deepEqual(sent, ["«La luna» va de camino"], "una sola vez");
      // otro pedido con el mismo título y el mismo buzón sí sale
      assert.ok((await sendShipped("ana@example.com", "La luna", "https://x/seguimiento/1", "camino:o2:g2")).sent);
      assert.equal(sent.length, 2);
    },
  );
  // Resend responde 409 mientras el primero no ha terminado
  await withResend(
    () => new Response(JSON.stringify({ name: "concurrent_idempotent_requests" }), { status: 409 }),
    async () => assert.deepEqual(await sendShipped("ana@example.com", "La luna", "https://x/s/1", "camino:o1:g1"), { sent: false, reason: "en_curso" }),
  );
  // con la misma clave y otro contenido (ya mandado): se da por mandado
  await withResend(
    () => new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 }),
    async () => assert.deepEqual(await sendShipped("ana@example.com", "La luna", "https://x/s/1", "camino:o1:g1"), { sent: true }),
  );
});

test("lo que el padre vuelve a pedir sale cada vez (sus cuentos, sin clave); los avisos a soporte de un mismo evento de Stripe, una vez por buzón", async () => {
  await withResend(
    () => ok(),
    async (sent) => {
      const books = [{ title: "La luna", link: "https://x/crear?b=1" }];
      assert.ok((await sendYourBooks("ana@example.com", books)).sent);
      assert.ok((await sendYourBooks("ana@example.com", books)).sent);
      assert.equal(sent.length, 2, "el mismo contenido dos veces: las dos salen");
      const env = { MAIL_FORWARD_TO: "alvaro@example.com, soporte@example.com" };
      await sendSupportNotice("Cobro doble", "texto", { key: "stripe:evt_1:double_charge", env });
      await sendSupportNotice("Cobro doble", "texto", { key: "stripe:evt_1:double_charge", env });
      assert.equal(sent.length, 4, "dos buzones, una vez cada uno");
      await sendSupportNotice("Cobro doble", "texto", { key: "stripe:evt_2:double_charge", env });
      assert.equal(sent.length, 6, "otro evento, otro aviso");
    },
  );
});

test("qué fallos se reintentan: red y Resend caído o saturado, no una dirección rechazada ni el correo sin configurar", () => {
  for (const reason of ["red", "error", "resend_429", "resend_500", "resend_503"]) assert.equal(transientMailFailure({ sent: false, reason }), true, reason);
  for (const reason of ["resend_422", "resend_403", "sin_configurar", "sin_destino", "en_curso"]) assert.equal(transientMailFailure({ sent: false, reason }), false, reason);
  assert.equal(transientMailFailure({ sent: true }), false);
  // y cuándo se deja de intentar: salió o no tiene arreglo; «en_curso» lo decide el otro envío
  assert.equal(mailSettled({ sent: true }), true);
  assert.equal(mailSettled({ sent: false, reason: "resend_422" }), true);
  assert.equal(mailSettled({ sent: false, reason: "sin_configurar" }), true);
  assert.equal(mailSettled({ sent: false, reason: "resend_503" }), false);
  assert.equal(mailSettled({ sent: false, reason: "en_curso" }), false);
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
  let calls = 0;
  assert.equal((await printCron(store, deps(async () => (calls++, { sent: true }), later))).remailed, 0);
  assert.equal(calls, 0);
  assert.equal((await store.getOrderById(s.orderId))?.info?.sentMailPending ?? null, null, "y se desmarca: no vuelve cada día");
});

test("la marca se pone con el estado, antes de mandar, y se quita sobre lo que haya entonces en el pedido (revisión 27 oct)", async () => {
  const { store, bookId } = await readyBook();
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  const keys: (string | undefined)[] = [];
  const d = deps(async (_to, _title, _link, _address, key) => {
    keys.push(key);
    const cur = (await store.getOrderById(s.orderId))!;
    assert.equal(cur.printStatus, "sent");
    assert.equal(cur.info?.sentMailPending, true, "pendiente ya antes de mandarlo: si la función se corta aquí, lo manda el cron");
    // mientras sale el email llega el aviso de la imprenta con otro hito
    await store.updateOrder(s.orderId, { info: { ...cur.info, steps: { ...cur.info?.steps, in_production: "2026-10-27T10:00:00.000Z" } } });
    return { sent: true };
  });
  assert.ok((await completePrint(store, s.orderId, d)).ok);
  const info = (await store.getOrderById(s.orderId))?.info;
  assert.equal(info?.sentMailPending ?? null, null);
  assert.equal(info?.steps?.in_production, "2026-10-27T10:00:00.000Z", "el hito de entre medias no se pierde");
  assert.ok(info?.steps?.sent);
  assert.deepEqual(keys, [`imprenta:${s.orderId}:gel-1-abcdef`], "la clave es el pedido en la imprenta");
});

test("«en curso» deja la marca; un rechazo en el cron la quita y no se vuelve a intentar", async () => {
  const { store, bookId } = await readyBook();
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  assert.ok((await completePrint(store, s.orderId, deps(async () => ({ sent: false, reason: "en_curso" })))).ok);
  assert.equal((await store.getOrderById(s.orderId))?.info?.sentMailPending, true);
  assert.equal((await printCron(store, deps(async () => ({ sent: false, reason: "resend_422" })))).remailed, 0);
  assert.equal((await store.getOrderById(s.orderId))?.info?.sentMailPending ?? null, null);
  let calls = 0;
  await printCron(store, deps(async () => (calls++, { sent: true })));
  assert.equal(calls, 0);
});

test("refreshPrint: un pedido que llegó a la imprenta sin guardarse se da por enviado, y su email pendiente lo manda el cron", async () => {
  const { store, bookId } = await readyBook();
  const s = await startPrint(store, bookId, "gelato", {});
  assert.ok(s.ok);
  // la función se cortó después de crear el pedido en la imprenta: se queda en «sending» con su id
  await store.updateOrder(s.orderId, { printOrderId: "gel-9-abcdef" });
  const gelato = { id: "gel-9-abcdef", status: "created", orderReferenceId: s.orderId, trackingUrl: null, trackingCode: null, method: null, etaFrom: null, etaTo: null };
  const down = { ...deps(async () => ({ sent: false, reason: "red" })), getOrder: async () => gelato };
  assert.equal(await refreshPrint(store, (await store.getOrderById(s.orderId))!, down), "updated");
  const order = (await store.getOrderById(s.orderId))!;
  assert.equal(order.printStatus, "sent");
  assert.equal(order.info?.sentMailPending, true);
  const keys: (string | undefined)[] = [];
  assert.equal((await printCron(store, deps(async (_to, _t, _l, _a, key) => (keys.push(key), { sent: true })))).remailed, 1);
  assert.deepEqual(keys, [`imprenta:${s.orderId}:gel-9-abcdef`]);
  assert.equal((await store.getOrderById(s.orderId))?.info?.sentMailPending ?? null, null);
});

test("el cron pide a Supabase solo los pedidos con el email pendiente", async () => {
  const urls: URL[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    urls.push(new URL(String(input)));
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  const store = supabaseStore(createClient<Database>("https://x.supabase.co", "k", { global: { fetch }, auth: { persistSession: false } }));
  await store.listPrintOrders(["sent", "in_production"], 200, true, { sentMailPending: true });
  await store.listPrintOrders(["sent"], 10, true);
  assert.equal(urls[0].searchParams.get("print_info->>sentMailPending"), "eq.true");
  assert.equal(urls[1].searchParams.get("print_info->>sentMailPending"), null);
});

test("«tu libro está listo» desde dos segundos planos que terminan a la vez: sale una vez (la clave es el libro)", async () => {
  const { store, bookId } = await readyBook();
  let calls = 0;
  await withResend(
    () => (calls++, ok()),
    async (sent) => {
      const link = (id: string) => `https://www.erasesuvez.com/crear?b=${id}`;
      const [a, b] = await Promise.all([notifyBookReady(store, bookId, link, sendBookReady), notifyBookReady(store, bookId, link, sendBookReady)]);
      assert.ok(a || b);
      assert.equal(calls, 2, "los dos llegan a mandarlo");
      assert.equal(sent.length, 1);
      assert.match(sent[0], /^Tu libro está listo/);
    },
  );
});

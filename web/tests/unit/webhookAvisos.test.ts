/**
 * El webhook de Stripe entero (revisión 27 oct): si el aviso a soporte no sale por un fallo pasajero, responde 500, y el
 * reintento de Stripe lo vuelve a mandar, también cuando el evento ya cambió la base (una devolución). Sin red: Stripe y
 * Resend de mentira con `fetch`, la base en memoria y el evento firmado como lo firma Stripe.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import Module from "node:module";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { recordStripePayment, startBook } from "../../lib/book/service";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

// las rutas importan `server-only`, que fuera de Next lanza: aquí, su versión vacía (la que usa Next en el servidor)
const resolver = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolve = resolver._resolveFilename;
const serverOnlyEmpty = require.resolve("server-only").replace(/index\.js$/, "empty.js");
resolver._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolve.call(this, request === "server-only" ? serverOnlyEmpty : request, ...rest);
};

const SECRET = "whsec_prueba";
const ENV: Record<string, string | undefined> = {
  STRIPE_WEBHOOK_SECRET: SECRET,
  STRIPE_SECRET_KEY: "sk_test_de_mentira",
  GENERATION_PROVIDER: "dry-run",
  RESEND_API_KEY: "re_de_mentira",
  MAIL_FROM: "Érase su vez <hola@example.com>",
  MAIL_FORWARD_TO: "soporte@example.com",
  NEXT_PUBLIC_SUPABASE_URL: undefined,
  SUPABASE_SERVICE_ROLE_KEY: undefined,
  VERCEL_ENV: undefined,
};

/** Resend falla las primeras `failures` veces (red caída) y después acepta; Stripe dice de qué sesión es el cobro. */
function fakeNet(failures: number) {
  const mails: { subject: string }[] = [];
  let left = failures;
  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://api.stripe.com/v1/checkout/sessions")) return Response.json({ data: [{ id: "cs_test_hc" }] });
    if (url === "https://api.resend.com/emails") {
      if (left-- > 0) throw new TypeError("fetch failed");
      mails.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "em_1" });
    }
    throw new Error(`sin red en los tests: ${url}`);
  };
  return { fetch, mails };
}

function signed(event: object): Request {
  const payload = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", SECRET).update(`${t}.${payload}`).digest("hex");
  return new Request("https://www.erasesuvez.com/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": `t=${t},v1=${v1}` } });
}

async function withWorld<T>(failures: number, fn: (net: ReturnType<typeof fakeNet>) => Promise<T>): Promise<T> {
  const prevEnv: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(ENV)) {
    prevEnv[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  const prevFetch = globalThis.fetch;
  const g = globalThis as unknown as { __cuentosGen?: unknown };
  const prevState = g.__cuentosGen;
  g.__cuentosGen = undefined;
  const net = fakeNet(failures);
  globalThis.fetch = net.fetch as typeof fetch;
  try {
    return await fn(net);
  } finally {
    globalThis.fetch = prevFetch;
    g.__cuentosGen = prevState;
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** Un libro con la tapa dura pagada (sesión cs_test_hc), en la base en memoria que usa el webhook. */
async function paidHardcover(): Promise<string> {
  const store = memoryStore();
  const ficha = normalizeFicha(EVAL_CASES[0]);
  const start = await startBook(store, { email: "vera@example.com", ficha, plan: mockPlan(ficha), planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok, JSON.stringify(start));
  await paintAll(store, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  const ev = { type: "checkout.session.completed", data: { object: { id: "cs_test_hc", payment_status: "paid", amount_total: 3490, currency: "eur", metadata: { bookId: start.bookId, edition: "hardcover" } } } };
  assert.equal((await recordStripePayment(store, ev, {})).action, "paid");
  return start.bookId;
}

test("webhook: devolución con el aviso sin salir, 500; el reintento de Stripe manda el aviso y responde 200", async () => {
  await withWorld(1, async (net) => {
    await paidHardcover();
    const { POST } = await import("../../app/api/stripe/webhook/route");
    const refund = { id: "evt_1", type: "charge.refunded", livemode: false, data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 3490, amount_refunded: 3490, refunded: true, currency: "eur" } } };
    const first = await POST(signed(refund));
    assert.equal(first.status, 500, "antes respondía 200 y el aviso se perdía");
    assert.equal(net.mails.length, 0);
    const again = await POST(signed(refund));
    assert.equal(again.status, 200);
    assert.deepEqual(
      net.mails.map((m) => m.subject),
      ["Devolución: «Vera y la gran idea»"],
    );
  });
});

test("webhook: cobro doble con el aviso sin salir, 500; el reintento lo manda", async () => {
  await withWorld(1, async (net) => {
    const bookId = await paidHardcover();
    const { POST } = await import("../../app/api/stripe/webhook/route");
    const second = { id: "evt_2", type: "checkout.session.completed", livemode: false, data: { object: { id: "cs_test_otra", payment_status: "paid", amount_total: 3490, currency: "eur", metadata: { bookId, edition: "hardcover" } } } };
    assert.equal((await POST(signed(second))).status, 500);
    assert.equal((await POST(signed(second))).status, 200);
    assert.deepEqual(
      net.mails.map((m) => m.subject),
      ["Cobro doble de un libro ya pagado"],
    );
  });
});

/**
 * Datos que se quedaban de más (auditoría 26 oct, I23, I24 e I25): la dirección tras la entrega, los cuentos escritos
 * tras 30 días, los nombres en los logs y la caché de cuentos compartida entre familias. Sin red: un Supabase de mentira
 * que apunta lo que se le pide.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { purgeExpired, supabasePurgeDb } from "../../lib/purge";
import { fichaHash, normalizeFicha, planCacheKey } from "../../lib/plan/ficha";
import { planBook } from "../../lib/plan/planner";
import type { Llm } from "../../lib/llm";
import { EVAL_CASES } from "../../lib/plan/evalCases";

type Call = { table: string; op: string; payload?: unknown; filters: string[] };

/** Cliente de mentira: cada consulta apunta tabla, operación, datos y filtros; `rows` da lo que devuelve cada select. */
function fakeClient(rows: Record<string, unknown[]>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const q: Record<string, unknown> = {};
    const chain = (name: string) => (...args: unknown[]) => (call.filters.push(`${name}(${args.map((a) => JSON.stringify(a)).join(",")})`), q);
    for (const m of ["eq", "neq", "not", "lt", "gt", "in", "or", "like", "limit", "order"]) q[m] = chain(m);
    q.select = () => q;
    q.update = (payload: unknown) => ((call.op = "update"), (call.payload = payload), q);
    q.delete = () => ((call.op = "delete"), q);
    q.then = (ok: (v: { data: unknown; error: null; count?: number }) => unknown) => {
      const data = call.op === "select" ? (rows[table] ?? []) : call.op === "delete" ? [{ id: 1 }, { id: 2 }] : [];
      return Promise.resolve({ data, error: null, count: (rows[table] ?? []).length }).then(ok);
    };
    return q;
  };
  return { client: { from } as unknown as SupabaseClient<Database>, calls };
}

const ADDRESS = { name: "Ana García López", line1: "Calle Mayor 12", postcode: "28013", city: "Madrid", country: "ES", phone: "600111222" };

test("I23: al entregarse, el pedido pierde la dirección, el teléfono y el seguimiento; y un borrador de hace un día, su dirección", async () => {
  const { client, calls } = fakeClient({
    cuentos_orders: [{ id: "o1", print_info: { method: "Normal", trackingCode: "ABC123", steps: { delivered: "2026-10-20T10:00:00Z" } } }],
    cuentos_books: [{ id: "b1", draft: { v: 2, plan: { title: "T" }, shipping: ADDRESS }, updated_at: "2026-10-01T10:00:00.123456+00:00" }],
  });
  const n = await supabasePurgeDb(client, {}).scrubShipping!(new Date("2026-10-26T00:00:00Z"), false);
  assert.equal(n, 2);
  const sel = calls.find((c) => c.table === "cuentos_orders" && c.op === "select")!;
  assert.ok(sel.filters.includes('eq("print_status","delivered")') && sel.filters.includes('not("shipping","is",null)'), sel.filters.join(" "));
  const order = calls.find((c) => c.table === "cuentos_orders" && c.op === "update")!;
  assert.deepEqual(order.payload, { shipping: null, print_tracking_url: null, print_info: { method: "Normal", steps: { delivered: "2026-10-20T10:00:00Z" } } });
  const bookSel = calls.find((c) => c.table === "cuentos_books" && c.op === "select")!;
  assert.ok(bookSel.filters.includes('not("draft->shipping","is",null)') && bookSel.filters.some((f) => f.startsWith('lt("updated_at"')), bookSel.filters.join(" "));
  const book = calls.find((c) => c.table === "cuentos_books" && c.op === "update")!;
  assert.deepEqual(book.payload, { draft: { v: 2, plan: { title: "T" } } });
  assert.ok(book.filters.includes('eq("updated_at","2026-10-01T10:00:00.123456+00:00")'), "solo si nadie lo ha tocado entre medias");
});

test("I23: con dry=1 solo cuenta; la purga lo pide con un día de margen", async () => {
  const { client, calls } = fakeClient({ cuentos_orders: [{ id: "o1", print_info: null }], cuentos_books: [] });
  assert.equal(await supabasePurgeDb(client, {}).scrubShipping!(new Date(), true), 1);
  assert.ok(!calls.some((c) => c.op === "update"));
  let asked: Date | null = null;
  const now = new Date("2026-10-27T12:00:00Z");
  await purgeExpired(
    {
      expiredBooks: async () => [],
      bookFiles: async () => [],
      removeFiles: async () => undefined,
      hasPaidOrder: async () => false,
      deleteBook: async () => undefined,
      scrubPaidBook: async () => undefined,
      scrubStories: async () => 0,
      scrubLeads: async () => 0,
      scrubSpend: async () => 0,
      scrubShipping: async (d) => ((asked = d), 3),
    },
    { now },
  ).then((r) => assert.equal(r.shipping, 3));
  assert.equal(asked!.toISOString(), "2026-10-26T12:00:00.000Z");
});

test("I24: los cuentos escritos de hace más de 30 días se borran enteros, no solo se vacían", async () => {
  const { client, calls } = fakeClient({ cuentos_stories: [] });
  const n = await supabasePurgeDb(client, {}).scrubStories(new Date("2026-09-27T00:00:00Z"), false);
  assert.equal(n, 2);
  const del = calls.find((c) => c.table === "cuentos_stories")!;
  assert.equal(del.op, "delete");
  assert.ok(del.filters.includes('lt("created_at","2026-09-27T00:00:00.000Z")'));
});

test("I24: si el cuento no vale, el log dice cuántos avisos, no su texto (lleva nombres)", async () => {
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (...a: unknown[]) => void warns.push(a.join(" "));
  try {
    const llm: Llm = { name: "anthropic", model: "x", complete: async () => ({ raw: JSON.stringify({ title: "Lucía y la abuela Carmen", pages: [] }), model: "x", usage: { input: 1, output: 1 }, ms: 1 }) };
    const r = await planBook({ ...EVAL_CASES[0], hero: { ...EVAL_CASES[0].hero, name: "Lucía" } }, llm);
    assert.ok(!r.ok);
  } finally {
    console.warn = orig;
  }
  const line = warns.find((w) => w.startsWith("[plan] sin plan válido"))!;
  assert.match(line, /\d+ avisos$/);
  assert.doesNotMatch(line, /Lucía|Carmen/);
});

test("I25: dos fichas iguales salvo el aspecto comparten huella de historia, pero no la llave de la caché", () => {
  const base = normalizeFicha(EVAL_CASES[0]);
  const other = normalizeFicha({ ...EVAL_CASES[0], hero: { ...EVAL_CASES[0].hero, look: { ...EVAL_CASES[0].hero.look, unique: "lleva audífono en la oreja izquierda" }, outfit: "su peto amarillo del cole" } });
  assert.equal(fichaHash(base), fichaHash(other), "cambiar el aspecto no reescribe el cuento");
  assert.notEqual(planCacheKey(base), planCacheKey(other));
  assert.equal(planCacheKey(base), planCacheKey(normalizeFicha(EVAL_CASES[0])));
});

/** Cuentos con dibujos gratis por persona (26 oct): 3 cada 30 días, se renuevan al comprar, se mira antes de dibujar. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState } from "../../lib/generation/store";
import { payDryRun, reviseSheet, startBook } from "../../lib/book/service";
import { FREE_BOOKS, freeUse, normalizeEmail } from "../../lib/book/freeLimit";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

const ficha = normalizeFicha(EVAL_CASES[0]);
const plan = mockPlan(ficha);
const start = (store: ReturnType<typeof memoryStore>, email: string) => startBook(store, { email, ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);

test("normalizeEmail: el mismo buzón escrito de otra forma", () => {
  assert.equal(normalizeEmail(" Ana.Garcia+cuentos@Gmail.com "), "anagarcia@gmail.com");
  assert.equal(normalizeEmail("ana.garcia@googlemail.com"), "anagarcia@gmail.com");
  assert.equal(normalizeEmail("ana.garcia+x@empresa.es"), "ana.garcia@empresa.es", "fuera de Gmail, los puntos cuentan");
  assert.equal(normalizeEmail("raro"), "raro");
});

test("3 cuentos con dibujos por buzón; el cuarto no dibuja y devuelve los que tiene (sin gastar nada)", async () => {
  const store = memoryStore(newMemoryState());
  const lefts: (number | undefined)[] = [];
  for (const e of ["vera@gmail.com", "v.era@gmail.com", "vera+2@gmail.com"]) {
    const r = await start(store, e);
    assert.ok(r.ok, JSON.stringify(r));
    lefts.push(r.freeLeft);
  }
  assert.deepEqual(lefts, [2, 1, 0], "el último se avisa");
  const allJobs = async () => (await Promise.all((await store.listBooksByEmailDomain("gmail.com", "2000-01-01")).map((b) => store.listJobs(b.id)))).flat().length;
  const before = await allJobs();
  const r = await start(store, "VERA@gmail.com");
  assert.ok(!r.ok && r.error === "free_limit", JSON.stringify(r));
  assert.equal((r as unknown as { books: unknown[] }).books.length, FREE_BOOKS);
  assert.equal(await allJobs(), before, "no se encola ninguna imagen");
  // otro buzón, sin problema
  assert.ok((await start(store, "otra@gmail.com")).ok);
});

test("dentro de un cuento empezado, los cambios con palabras no cuentan como cuentos nuevos", async () => {
  const store = memoryStore(newMemoryState());
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await start(store, "ana@example.com");
    assert.ok(r.ok);
    ids.push(r.bookId);
  }
  const r = await reviseSheet(store, { bookId: ids[2], instruction: "más rizos" }, dryRunAdapter, MOCK_LLM);
  assert.ok(r.ok, JSON.stringify(r));
});

test("comprar un libro renueva los gratis", async () => {
  const store = memoryStore(newMemoryState());
  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await start(store, "ana@example.com");
    assert.ok(r.ok);
    ids.push(r.bookId);
  }
  assert.equal(((await start(store, "ana@example.com")) as { error: string }).error, "free_limit");
  assert.ok((await payDryRun(store, { bookId: ids[0], edition: "illustrated" })).ok);
  const r = await start(store, "ana@example.com");
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.freeLeft, FREE_BOOKS - 1);
});

test("pasados 30 días, los cuentos viejos ya no cuentan", async () => {
  const store = memoryStore(newMemoryState());
  for (let i = 0; i < 3; i++) assert.ok((await start(store, "ana@example.com")).ok);
  const now = Date.now();
  assert.equal((await freeUse(store, "ana@example.com", { now })).used, 3);
  assert.equal((await freeUse(store, "ana@example.com", { now: now + 31 * 24 * 3600 * 1000 })).used, 0);
});

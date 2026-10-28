/** Cuentos con dibujos gratis por persona (26 oct): 3 cada 30 días, se renuevan al comprar, se mira antes de dibujar. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_LLM, type Llm } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { createClient } from "@supabase/supabase-js";
import { memoryStore, newMemoryState, supabaseStore } from "../../lib/generation/store";
import type { Database } from "../../lib/supabase/types";
import { reviseSheet, startBook } from "../../lib/book/service";
import { CLAIM_TTL_MS, FREE_BOOKS, freeLockKey, freeUse, normalizeEmail, passFreeGate } from "../../lib/book/freeLimit";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";
import { payApproved } from "./pagar";

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
  const allJobs = async () => (await Promise.all((await store.listFreeBooks("vera@gmail.com", "2000-01-01")).map((b) => store.listJobs(b.id)))).flat().length;
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
  const sheets: string[] = [];
  for (let i = 0; i < 3; i++) {
    const r = await start(store, "ana@example.com");
    assert.ok(r.ok);
    ids.push(r.bookId);
    sheets.push(r.sheetJobId);
  }
  assert.equal(((await start(store, "ana@example.com")) as { error: string }).error, "free_limit");
  // se paga con los personajes dibujados
  await store.updateJob(sheets[0], { status: "done", chosen: "dry-run/sheet.png" });
  assert.ok((await payApproved(store, { bookId: ids[0], edition: "illustrated" })).ok);
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

test("I7: seis peticiones a la vez con el mismo buzón no pasan las seis", async () => {
  const store = memoryStore(newMemoryState());
  const emails = ["vera@gmail.com", "v.era@gmail.com", "vera+1@gmail.com", "VERA@gmail.com", "vera+2@googlemail.com", "ve.ra@gmail.com"];
  const rs = await Promise.all(emails.map((e) => start(store, e)));
  const ok = rs.filter((r) => r.ok);
  assert.equal(ok.length, FREE_BOOKS, JSON.stringify(rs.map((r) => (r.ok ? "ok" : r.error))));
  assert.deepEqual(rs.filter((r) => !r.ok).map((r) => (r as { error: string }).error), ["free_limit", "free_limit", "free_limit"]);
  assert.deepEqual(ok.map((r) => (r.ok ? r.freeLeft : -1)).sort(), [0, 1, 2], "cada uno ve los anteriores");
  // y el bloqueo queda suelto
  assert.ok(await store.lock(freeLockKey("vera@gmail.com"), 1000));
});

test("I7: un libro que acaba de pasar la puerta cuenta aunque aún no tenga hoja; si no llega a tenerla, deja de contar", async () => {
  const store = memoryStore(newMemoryState());
  const books = [];
  for (let i = 0; i < 3; i++) books.push(await store.saveBook({ email: "ana@example.com", draft: { v: 2, plan: { title: `Cuento ${i}` } }, edition: "illustrated" }));
  const now = Date.now();
  for (const b of books) assert.ok((await passFreeGate(store, "ana@example.com", b.id, { now: () => now })).ok);
  const use = await freeUse(store, "ana@example.com", { now });
  assert.equal(use.used, 3, "los tres están empezando");
  assert.deepEqual(use.books.map((b) => b.title).sort(), ["Cuento 0", "Cuento 1", "Cuento 2"], "con el título, sin leer el borrador entero");
  const fourth = await store.saveBook({ email: "ana@example.com", draft: { v: 2 }, edition: "illustrated" });
  assert.equal(((await passFreeGate(store, "ana@example.com", fourth.id, { now: () => now })) as { ok: boolean }).ok, false);
  // pasado el plazo sin personajes (falló antes de pintar), ya no cuentan
  const later = now + CLAIM_TTL_MS + 1000;
  assert.equal((await freeUse(store, "ana@example.com", { now: later })).used, 0);
  assert.ok((await passFreeGate(store, "ana@example.com", fourth.id, { now: () => later })).ok);
});

test("I7: «Reintentar» de un cuento con la hoja fallida cuenta mientras vuelve a pintar; si falla otra vez, no", async () => {
  const store = memoryStore(newMemoryState());
  const r = await start(store, "ana@example.com");
  assert.ok(r.ok);
  const sheet = (await store.listJobs(r.bookId)).find((j) => j.kind === "sheet")!;
  await store.updateJob(sheet.id, { status: "failed", error: "gemini 503" });
  assert.equal((await freeUse(store, "ana@example.com")).used, 0, "con la hoja fallida no cuenta (B8)");
  // el reintento pasa la puerta: mientras se reabre la hoja, otro cuento a la vez ya lo ve
  assert.ok((await passFreeGate(store, "ana@example.com", r.bookId)).ok);
  assert.equal((await freeUse(store, "ana@example.com")).used, 1);
  // vuelve a fallar después de pasar la puerta: deja de contar
  await store.updateJob(sheet.id, { status: "failed", error: "gemini 503" });
  assert.equal((await freeUse(store, "ana@example.com")).used, 0);
});

test("I7: con el bloqueo del buzón cogido, la puerta espera y, si no se suelta, pide esperar sin dibujar", async () => {
  const store = memoryStore(newMemoryState());
  const book = await store.saveBook({ email: "ana@example.com", draft: { v: 2 }, edition: "illustrated" });
  const holder = await store.lock(freeLockKey("Ana@Example.com"), 60_000);
  assert.ok(holder, "la clave es la del buzón normalizado");
  assert.deepEqual(await passFreeGate(store, "ana@example.com", book.id, { waitMs: 300 }), { ok: false, busy: true });
  // si lo suelta mientras espera, entra
  setTimeout(() => void store.unlock(freeLockKey("ana@example.com"), holder!), 150);
  assert.ok((await passFreeGate(store, "ana@example.com", book.id, { waitMs: 2000 })).ok);
  // desde la ruta: 409 con un mensaje para el padre, y sin ninguna imagen encolada
  await store.lock(freeLockKey("ana@example.com"), 60_000);
  const t0 = Date.now();
  const r = await start(store, "ana@example.com");
  assert.ok(!r.ok && r.status === 409 && r.error === "busy" && /unos segundos/.test(r.reason ?? ""), JSON.stringify(r));
  assert.ok(Date.now() - t0 < 12_000);
  assert.equal((await store.listFreeBooks("ana@example.com", "2000-01-01")).flatMap((b) => b.sheets).length, 0);
});

test("I7: un bloqueo que nadie suelta caduca y lo coge otro; soltar solo vale con la marca propia", async () => {
  const store = memoryStore(newMemoryState());
  const a = await store.lock("k", 50);
  assert.ok(a);
  assert.equal(await store.lock("k", 50), null);
  await store.unlock("k", "otra-marca");
  assert.equal(await store.lock("k", 50), null, "una marca ajena no lo suelta");
  await new Promise((r) => setTimeout(r, 70));
  const b = await store.lock("k", 50);
  assert.ok(b && b !== a, "caducado, lo coge otro");
});

test("I7: en Supabase, el límite se cuenta con tres consultas pequeñas por email_norm y el bloqueo usa cuentos_locks", async () => {
  const calls: { method: string; url: URL; prefer: string; body: unknown }[] = [];
  const reply = (url: URL, method: string): unknown => {
    const table = url.pathname.split("/").pop();
    if (table === "cuentos_books") return [{ id: "b1", public_id: "abcd2345ef", email: "v.era@gmail.com", created_at: "2026-10-27T10:00:00Z", free_claimed_at: null, title: "El dragón" }];
    if (table === "cuentos_orders") return [];
    if (table === "cuentos_generation_jobs") return [{ book_id: "b1", status: "error", updated_at: "2026-10-27T10:01:00Z" }];
    if (table === "cuentos_locks" && method === "POST") return [];
    if (table === "cuentos_locks" && method === "PATCH") return [{ holder: JSON.parse(String(calls[calls.length - 1].body)).holder }];
    return [];
  };
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    calls.push({ method, url, prefer: headers.get("Prefer") ?? "", body: init?.body ?? null });
    return new Response(JSON.stringify(reply(url, method)), { status: 200, headers: { "content-type": "application/json" } });
  };
  const db = createClient<Database>("https://x.supabase.co", "k", { global: { fetch }, auth: { persistSession: false } });
  const store = supabaseStore(db);

  const books = await store.listFreeBooks("vera@gmail.com", "2026-09-27T00:00:00Z");
  assert.deepEqual(books, [{ id: "b1", publicId: "abcd2345ef", createdAt: "2026-10-27T10:00:00Z", freeClaimedAt: null, title: "El dragón", email: "v.era@gmail.com", paid: [], sheets: [{ status: "failed", updatedAt: "2026-10-27T10:01:00Z" }] }]);
  assert.equal(calls.length, 3);
  const [q] = calls;
  assert.equal(q.url.searchParams.get("select"), "id,public_id,email,created_at,free_claimed_at,title:draft->plan->>title", "del borrador, solo el título; el email guardado, para mandar ahí su enlace");
  assert.equal(q.url.searchParams.get("email_norm"), "eq.vera@gmail.com");
  assert.equal(q.url.searchParams.get("free_claimed_at"), "not.is.null", "solo los que pasaron la puerta");
  assert.equal(q.url.searchParams.get("created_at"), "gte.2026-09-27T00:00:00Z");
  assert.equal(q.url.searchParams.get("limit"), "100");
  assert.equal(calls[1].url.searchParams.get("book_id"), "in.(b1)");
  assert.equal(calls[1].url.searchParams.get("status"), "eq.paid");
  assert.equal(calls[2].url.searchParams.get("kind"), "eq.sheet");

  calls.length = 0;
  // la fila ya existe (el insert no devuelve nada) y estaba caducada: se la queda con un update condicionado
  const holder = await store.lock("free:abc", 20_000);
  assert.ok(holder);
  const [ins, upd] = calls;
  assert.equal(ins.method, "POST");
  assert.equal(ins.url.searchParams.get("on_conflict"), "key");
  assert.match(ins.prefer, /resolution=ignore-duplicates/);
  assert.match(ins.prefer, /return=representation/);
  assert.equal(upd.method, "PATCH");
  assert.equal(upd.url.searchParams.get("key"), "eq.free:abc");
  assert.match(upd.url.searchParams.get("expires_at") ?? "", /^lt\./);
  calls.length = 0;
  await store.unlock("free:abc", holder!);
  assert.equal(calls[0].method, "DELETE");
  assert.equal(calls[0].url.searchParams.get("holder"), `eq.${holder}`);
});

test("revisión: si el dibujo no llega a empezar (el modelo de arte falla), el intento no gasta un cuento gratis", async () => {
  const store = memoryStore(newMemoryState());
  // un modelo que no es el de prueba y siempre falla (529)
  const down: Llm = { ...MOCK_LLM, name: "anthropic", async complete() {
    throw new Error("anthropic 529 overloaded");
  } };
  for (let i = 0; i < 3; i++) await assert.rejects(startBook(store, { email: "ana@example.com", ficha, plan, planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, down));
  assert.equal((await freeUse(store, "ana@example.com")).used, 0, "ninguno empezado");
  const r = await start(store, "ana@example.com");
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.freeLeft, FREE_BOOKS - 1);
});

test("revisión: los intentos rechazados no llenan la lista del buzón (los que cuentan siguen contando)", async () => {
  const store = memoryStore(newMemoryState());
  for (let i = 0; i < 3; i++) assert.ok((await start(store, "ana@example.com")).ok);
  for (let i = 0; i < 5; i++) assert.equal(((await start(store, "ana@example.com")) as { error?: string }).error, "free_limit");
  const listed = await store.listFreeBooks("ana@example.com", "2000-01-01");
  assert.equal(listed.length, 3, "solo los que pasaron la puerta");
});

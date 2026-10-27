/**
 * La misma imagen, la misma URL entre consultas (auditoría 26 oct, I20), y los alias de vercel.app llevan al dominio (I21).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { MOCK_LLM } from "../../lib/llm";
import { dryRunAdapter } from "../../lib/generation/adapter";
import { memoryStore, newMemoryState, supabaseStore, type GenStore } from "../../lib/generation/store";
import { paintAll } from "../../lib/book/background";
import { bookView, startBook } from "../../lib/book/service";
import { stableUrl } from "../../lib/bookClient";
import { brandRedirect } from "../../lib/site";
import type { Database } from "../../lib/supabase/types";
import { normalizeFicha } from "../../lib/plan/ficha";
import { mockPlan } from "../../lib/plan/mock";
import { EVAL_CASES } from "../../lib/plan/evalCases";

/** Storage falso: cada firma da un token nuevo, como el de verdad. */
function storage() {
  const signs: { paths: string[]; expiresIn: number }[] = [];
  let n = 0;
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = JSON.parse(String(init?.body ?? "{}")) as { paths: string[]; expiresIn: number };
    assert.equal(url.pathname, "/storage/v1/object/sign/cuentos");
    signs.push(body);
    return new Response(JSON.stringify(body.paths.map((p) => ({ path: p, signedURL: `/object/sign/cuentos/${p}?token=t${++n}`, error: null }))), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { db: createClient<Database>("https://x.supabase.co", "k", { global: { fetch }, auth: { persistSession: false } }), signs };
}

test("I20: se firman todas de una vez y la segunda consulta reutiliza las URL", async () => {
  const { db, signs } = storage();
  const store = supabaseStore(db);
  const a = await store.signedUrls(["books/x/p1.jpg", "books/x/p2.jpg"], 3600);
  assert.equal(signs.length, 1, "una llamada para todas");
  assert.ok(signs[0].expiresIn >= 3600);
  const b = await store.signedUrls(["books/x/p1.jpg", "books/x/p2.jpg", "books/x/p3.jpg"], 3600);
  assert.equal(b.get("books/x/p1.jpg"), a.get("books/x/p1.jpg"), "misma URL: el navegador ya la tiene");
  assert.deepEqual(signs[1].paths, ["books/x/p3.jpg"], "solo se firma la nueva");
  // la de una sola también sale de ahí
  assert.equal(await store.signedUrl("books/x/p2.jpg", 600), a.get("books/x/p2.jpg"));
  assert.equal(signs.length, 2);
  // otro cliente (otra instancia) no comparte la caché
  const other = storage();
  await supabaseStore(other.db).signedUrls(["books/x/p1.jpg"], 3600);
  assert.equal(other.signs.length, 1);
});

test("I20: si a la URL guardada no le queda lo que se pide, se firma otra", async () => {
  const { db, signs } = storage();
  const store = supabaseStore(db);
  await store.signedUrls(["books/x/p1.jpg"], 3600);
  // el PDF de la imprenta pide 7 días
  await store.signedUrls(["books/x/p1.jpg"], 7 * 24 * 3600);
  assert.equal(signs.length, 2);
  assert.equal(signs[1].expiresIn, 7 * 24 * 3600);
});

test("I20: la vista del libro firma en una sola llamada", async () => {
  const state = newMemoryState();
  const base = memoryStore(state);
  const ficha = normalizeFicha(EVAL_CASES[0]);
  const start = await startBook(base, { email: "vera@example.com", ficha, plan: mockPlan(ficha), planMeta: { provider: "mock", model: "mock" } }, dryRunAdapter, MOCK_LLM);
  assert.ok(start.ok);
  await paintAll(base, dryRunAdapter, [start.sheetJobId, start.coverJobId], { concurrency: 1, deadline: Date.now() + 30_000 });
  // las imágenes «guardadas» en Storage
  for (const j of state.jobs.values()) j.storage_path = `books/${j.book_id}/${j.kind}-${j.variant}.jpg`;
  const calls: string[][] = [];
  const store: GenStore = {
    ...base,
    async signedUrl() {
      throw new Error("una a una, no");
    },
    async signedUrls(paths) {
      calls.push(paths);
      return new Map(paths.map((p) => [p, `https://s/${p}?token=1`]));
    },
  };
  const v = await bookView(store, start.bookId);
  assert.ok(v.ok);
  assert.equal(calls.length, 1);
  assert.ok(v.jobs.filter((j) => j.status === "done").every((j) => j.url?.startsWith("https://s/books/")));
});

test("I20: en el navegador, la misma imagen conserva su primera URL 45 minutos", () => {
  const t0 = 1_000_000;
  const first = stableUrl("https://x.supabase.co/storage/v1/object/sign/cuentos/books/a/p1.jpg?token=uno", t0);
  assert.equal(stableUrl("https://x.supabase.co/storage/v1/object/sign/cuentos/books/a/p1.jpg?token=dos", t0 + 30 * 60_000), first);
  assert.equal(stableUrl("https://x.supabase.co/storage/v1/object/sign/cuentos/books/a/p2.jpg?token=tres", t0), "https://x.supabase.co/storage/v1/object/sign/cuentos/books/a/p2.jpg?token=tres", "otra imagen, su URL");
  // pasados 45 minutos, la nueva (la vieja puede estar a punto de caducar)
  assert.equal(stableUrl("https://x.supabase.co/storage/v1/object/sign/cuentos/books/a/p1.jpg?token=cuatro", t0 + 46 * 60_000), "https://x.supabase.co/storage/v1/object/sign/cuentos/books/a/p1.jpg?token=cuatro");
  assert.equal(stableUrl(null), null);
});

test("I21: en producción, los alias de vercel.app llevan al dominio; la API y las previews, no", () => {
  const prod = { VERCEL_ENV: "production", SITE_URL: "https://www.erasesuvez.com" };
  assert.equal(brandRedirect("cuentos-pi.vercel.app", "/privacidad", "", prod), "https://www.erasesuvez.com/privacidad");
  assert.equal(brandRedirect("cuentos-abc123-wcoach24s-projects.vercel.app", "/crear", "?b=abcd2345", prod), "https://www.erasesuvez.com/crear?b=abcd2345");
  assert.equal(brandRedirect("cuentos-pi.vercel.app", "/api/stripe/webhook", "", prod), null, "los webhooks no siguen redirecciones");
  assert.equal(brandRedirect("www.erasesuvez.com", "/", "", prod), null);
  assert.equal(brandRedirect("cuentos-git-feat-wcoach24s-projects.vercel.app", "/", "", { VERCEL_ENV: "preview", SITE_URL: "https://www.erasesuvez.com" }), null);
  assert.equal(brandRedirect("cuentos-pi.vercel.app", "/", "", { VERCEL_ENV: "production" }), null, "sin dominio puesto, nada");
});

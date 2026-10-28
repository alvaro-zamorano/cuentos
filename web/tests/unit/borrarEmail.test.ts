/**
 * Borrar a quien lo pide por su email (menores de la auditoría 26 oct). Sin red: una base de mentira que apunta lo que se
 * le pide.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { forgetEmail, storyKey, supabaseForgetDb, type ForgetDb } from "../../lib/forget";
import { ANON_LEAD } from "../../lib/purge";
import { normalizeFicha, planCacheKey, storyCacheKey } from "../../lib/plan/ficha";
import { EVAL_CASES } from "../../lib/plan/evalCases";

function fakeDb(books: { id: string; paid?: boolean; pendingPrint?: boolean; ficha?: unknown }[]) {
  const log: string[] = [];
  let asked = "";
  const db: ForgetDb = {
    booksOf: async (norm) => ((asked = norm), books.map((b) => ({ id: b.id, publicId: `p${b.id}`, ficha: b.ficha ?? null }))),
    bookFiles: async (id) => [`books/${id}/a.jpg`, `books/${id}/b.jpg`],
    removeFiles: async (paths) => void log.push(`files ${paths.length}`),
    hasPaidOrder: async (id) => !!books.find((b) => b.id === id)?.paid,
    printPending: async (id) => !!books.find((b) => b.id === id)?.pendingPrint,
    deleteBook: async (id) => void log.push(`delete ${id}`),
    scrubPaidBook: async (id) => void log.push(`scrub ${id}`),
    deleteStories: async (keys, dry) => (log.push(`stories ${keys.length}${dry ? " (contar)" : ""}`), keys.length),
    deleteLeads: async (_n, dry) => (log.push(`leads${dry ? " (contar)" : ""}`), 1),
    anonymizeSpend: async (_n, dry) => (log.push(`spend${dry ? " (contar)" : ""}`), 2),
  };
  return { db, log, asked: () => asked };
}

const ficha = EVAL_CASES[0];

test("borrar por email: sin pagar se borra; pagado se vacía y el pedido se queda; su cuento escrito, por la huella de la ficha", async () => {
  const { db, log, asked } = fakeDb([{ id: "11111111-a", ficha }, { id: "22222222-b", paid: true, ficha }]);
  const r = await forgetEmail(db, " Ana.Garcia+cole@GoogleMail.com ", { dryRun: false });
  assert.equal(asked(), "anagarcia@gmail.com", "todo el buzón, con sus variantes");
  assert.deepEqual({ deleted: r.deleted, scrubbed: r.scrubbed, files: r.files, stories: r.stories, leads: r.leads, spend: r.spend }, { deleted: 1, scrubbed: 1, files: 4, stories: 1, leads: 1, spend: 2 });
  assert.deepEqual(log, ["files 2", "delete 11111111-a", "files 2", "scrub 22222222-b", "stories 1", "leads", "spend"]);
  assert.equal(storyKey(ficha), `plan:${planCacheKey(normalizeFicha(ficha))}`);
  assert.equal(storyKey(ficha), storyCacheKey(normalizeFicha(ficha)), "la misma función que la caché de /api/plan");
});

test("borrar por email: sin --de-verdad solo cuenta", async () => {
  const { db, log } = fakeDb([{ id: "11111111-a" }, { id: "22222222-b", paid: true }]);
  const r = await forgetEmail(db, "ana@example.com");
  assert.equal(r.dryRun, true);
  assert.equal(r.deleted + r.scrubbed, 2);
  assert.ok(!log.some((l) => l.startsWith("delete") || l.startsWith("scrub") || l.startsWith("files")), log.join(" | "));
});

test("una tapa dura pagada sin imprimir no se toca sin pedirlo: sin sus imágenes ya no se podría imprimir", async () => {
  const { db, log } = fakeDb([{ id: "33333333-c", paid: true, pendingPrint: true }]);
  const r = await forgetEmail(db, "ana@example.com", { dryRun: false });
  assert.deepEqual(r.skippedPrint, ["ref. 33333333"]);
  assert.ok(!log.some((l) => l.startsWith("scrub")));
  const forced = await forgetEmail(fakeDb([{ id: "33333333-c", paid: true, pendingPrint: true }]).db, "ana@example.com", { dryRun: false, evenIfNotPrinted: true });
  assert.equal(forced.scrubbed, 1);
});

test("un email no válido no borra nada", async () => {
  await assert.rejects(forgetEmail(fakeDb([]).db, "no-es-un-email", { dryRun: false }), /no válido/);
});

/* ---------- supabaseForgetDb, con un Supabase de mentira (lo justo de PostgREST para lib/forget.ts y lib/purge.ts) ---------- */

type Row = Record<string, unknown>;

function fakeSupabase(tables: Record<string, Row[]>) {
  const cmp = (a: unknown, b: unknown) => (String(a ?? "") < String(b ?? "") ? -1 : String(a ?? "") > String(b ?? "") ? 1 : 0);
  const from = (name: string) => {
    const rows = (tables[name] ??= []);
    let mode: "select" | "delete" | "update" = "select";
    let patch: Row = {};
    let cols: string | null = null;
    let head = false;
    let range: [number, number] | null = null;
    let limit: number | null = null;
    let orderBy: string | null = null;
    const filters: ((r: Row) => boolean)[] = [];
    const pick = (r: Row) =>
      cols === null || cols === "*"
        ? { ...r }
        : Object.fromEntries(
            cols.split(",").map((c) => {
              const [alias, path] = c.includes(":") ? c.trim().split(":") : [c.trim(), c.trim()];
              const [col, key] = path.split("->");
              const v = r[col];
              return [alias, key ? ((v as Row | null)?.[key] ?? null) : v];
            }),
          );
    const run = () => {
      let hit = rows.filter((r) => filters.every((f) => f(r)));
      if (head) return { data: null, count: hit.length, error: null };
      if (orderBy) hit = [...hit].sort((a, b) => cmp(a[orderBy!], b[orderBy!]));
      if (mode === "select") {
        if (range) hit = hit.slice(range[0], range[1] + 1);
        hit = hit.slice(0, Math.min(limit ?? 1000, 1000)); // PostgREST no da más de 1000 por consulta
      }
      if (mode === "delete") for (const r of hit) rows.splice(rows.indexOf(r), 1);
      if (mode === "update") for (const r of hit) Object.assign(r, patch);
      return { data: mode === "select" || cols !== null ? hit.map(pick) : null, error: null };
    };
    const q = {
      select(c = "*", opts?: { head?: boolean }) {
        cols = c;
        head = !!opts?.head;
        return q;
      },
      delete() {
        mode = "delete";
        return q;
      },
      update(p: Row) {
        mode = "update";
        patch = p;
        return q;
      },
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      ilike(c: string, pattern: string) {
        const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`, "i");
        filters.push((r) => re.test(String(r[c] ?? "")));
        return q;
      },
      order: (c: string) => ((orderBy = c), q),
      range: (a: number, b: number) => ((range = [a, b]), q),
      limit: (n: number) => ((limit = n), q),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, ko),
    };
    return q;
  };
  const storage = { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) };
  return { from, storage } as unknown as SupabaseClient<Database>;
}

test("supabaseForgetDb: lee por páginas, solo cuenta como pagado un cobro real y borra todo el buzón", async () => {
  const target = "ana.garcia@gmail.com";
  const others = (n: number, col: string) => Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(5, "0"), [col]: `u${i}@gmail.com` }));
  const tables: Record<string, Row[]> = {
    cuentos_books: [
      { id: "b-pagado", public_id: "ppagado1", email_norm: "anagarcia@gmail.com", draft: { ficha }, status: "paid" },
      { id: "b-prueba", public_id: "pprueba1", email_norm: "anagarcia@gmail.com", draft: { ficha }, status: "paid" },
      { id: "b-imprimir", public_id: "pimprim1", email_norm: "anagarcia@gmail.com", draft: {}, status: "paid" },
      { id: "b-otro", public_id: "potro123", email_norm: "luis@gmail.com", draft: { ficha }, status: "draft" },
    ],
    cuentos_orders: [
      { id: "o1", book_id: "b-pagado", status: "paid", edition: "illustrated", stripe_session_id: "cs_live_1", print_status: null },
      { id: "o2", book_id: "b-prueba", status: "paid", edition: "hardcover", stripe_session_id: "cs_test_1", print_status: "awaiting_approval" },
      { id: "o3", book_id: "b-imprimir", status: "paid", edition: "hardcover", stripe_session_id: "cs_live_2", print_status: "awaiting_approval" },
    ],
    // más de una página de otros buzones del mismo dominio, y los suyos al final
    cuentos_leads: [
      ...others(1200, "email"),
      { id: "09000", email: target, edition: "illustrated" },
      { id: "09001", email: "anagarcia+cole@googlemail.com", edition: "classic" },
      { id: "09002", email: "ana.garcia@example.com", edition: "illustrated" },
    ],
    cuentos_spend: [...others(1100, "lead_id"), { id: "09000", lead_id: "Ana.Garcia@gmail.com" }, { id: "09001", lead_id: "ana.garcia@gmail.com" }],
    cuentos_stories: [{ id: "s1", input_hash: storyKey(ficha) }, { id: "s2", input_hash: "plan:otro" }],
  };
  const db = supabaseForgetDb(fakeSupabase(tables));
  assert.equal(await db.hasPaidOrder("b-pagado"), true);
  assert.equal(await db.hasPaidOrder("b-prueba"), false, "pagado solo con la tarjeta de prueba");
  assert.equal(await db.printPending!("b-imprimir"), true);
  assert.equal(await db.printPending!("b-prueba"), false, "una tapa dura de prueba no espera a la imprenta");
  assert.deepEqual((await db.booksOf("anagarcia@gmail.com")).map((b) => b.id).sort(), ["b-imprimir", "b-pagado", "b-prueba"]);

  const counted = await forgetEmail(db, "Ana.Garcia@gmail.com");
  assert.deepEqual(
    { deleted: counted.deleted, scrubbed: counted.scrubbed, skipped: counted.skippedPrint, stories: counted.stories, leads: counted.leads, spend: counted.spend },
    { deleted: 1, scrubbed: 1, skipped: ["ref. b-imprim"], stories: 1, leads: 2, spend: 2 },
  );
  assert.equal(tables.cuentos_leads.length, 1203, "contar no borra");

  await forgetEmail(db, "Ana.Garcia@gmail.com", { dryRun: false });
  assert.deepEqual(tables.cuentos_books.map((b) => b.id).sort(), ["b-imprimir", "b-otro", "b-pagado"], "el de prueba, fuera");
  const paid = tables.cuentos_books.find((b) => b.id === "b-pagado")!;
  assert.deepEqual([paid.draft, paid.status], [{}, "expired"], "el pagado de verdad se vacía y se queda");
  assert.equal(tables.cuentos_books.find((b) => b.id === "b-imprimir")!.status, "paid", "el que espera a la imprenta no se toca");
  assert.deepEqual(
    tables.cuentos_leads.filter((l) => String(l.email).includes("ana")).map((l) => l.email),
    ["ana.garcia@example.com"],
    "las dos filas de su buzón, aunque estén detrás de la primera página; la de otro dominio se queda",
  );
  assert.equal(tables.cuentos_leads.length, 1201);
  assert.deepEqual(tables.cuentos_spend.slice(-2).map((s) => s.lead_id), [ANON_LEAD, ANON_LEAD]);
  assert.deepEqual(tables.cuentos_stories.map((s) => s.id), ["s2"]);
});

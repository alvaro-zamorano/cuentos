/** Borrado a 30 días (lib/purge.ts) con una base falsa: qué se borra, qué se vacía y qué se conserva. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { purgeExpired, type PurgeDb } from "../../lib/purge";

const NOW = new Date("2026-10-16T12:00:00Z");

function fakeDb() {
  const books = new Map([
    ["a", { id: "a", publicId: "aaaaaaaa", expired: true, paid: false, status: "draft", files: ["books/a/sheet-0-1-x.jpg", "books/a/cover-0-1-y.jpg"], jobs: 2 }],
    ["b", { id: "b", publicId: "bbbbbbbb", expired: true, paid: true, status: "ready", files: ["books/b/page-1-1-z.jpg"], jobs: 14 }],
    ["c", { id: "c", publicId: "cccccccc", expired: false, paid: false, status: "draft", files: ["books/c/sheet-0-1-w.jpg"], jobs: 2 }],
  ]);
  const removed: string[] = [];
  let stories = 5;
  const OLD = "2026-09-01T00:00:00.000Z";
  const RECENT = "2026-10-10T00:00:00.000Z";
  // leads: con y sin novedades, viejos y recientes; «c@x.es» tiene un libro vigente (c)
  const leads = [
    { email: "a@x.es", marketing: false, created_at: OLD },
    { email: "b@x.es", marketing: true, created_at: OLD },
    { email: "c@x.es", marketing: false, created_at: OLD },
    { email: "d@x.es", marketing: false, created_at: RECENT },
  ];
  const liveEmails = new Set(["c@x.es"]);
  const spend = [
    { lead_id: "a@x.es", created_at: OLD },
    { lead_id: "libro-uuid", created_at: OLD },
    { lead_id: "d@x.es", created_at: RECENT },
  ];
  const db: PurgeDb = {
    async expiredBooks(limit) {
      return [...books.values()].filter((b) => b.expired && b.status !== "expired").slice(0, limit).map(({ id, publicId }) => ({ id, publicId }));
    },
    async bookFiles(id) {
      return [...(books.get(id)?.files ?? [])];
    },
    async removeFiles(paths) {
      removed.push(...paths);
      for (const b of books.values()) b.files = b.files.filter((f) => !paths.includes(f));
    },
    async hasPaidOrder(id) {
      return !!books.get(id)?.paid;
    },
    async deleteBook(id) {
      books.delete(id);
    },
    async scrubPaidBook(id) {
      const b = books.get(id)!;
      b.status = "expired";
      b.jobs = 0;
    },
    async scrubStories(_before, dryRun) {
      const n = stories;
      if (!dryRun) stories = 0;
      return n;
    },
    async scrubLeads(before, dryRun) {
      const gone = leads.filter((l) => !l.marketing && l.created_at < before.toISOString() && !liveEmails.has(l.email));
      if (!dryRun) for (const l of gone) leads.splice(leads.indexOf(l), 1);
      return gone.length;
    },
    async scrubSpend(before, dryRun) {
      const old = spend.filter((r) => r.lead_id.includes("@") && r.created_at < before.toISOString());
      if (!dryRun) for (const r of old) r.lead_id = "borrado";
      return old.length;
    },
  };
  return { db, books, removed, leads, spend };
}

test("purga: con dry=1 cuenta y no toca nada", async () => {
  const { db, books, removed } = fakeDb();
  const r = await purgeExpired(db, { dryRun: true });
  assert.deepEqual({ ...r }, { dryRun: true, deleted: 1, scrubbedPaid: 1, keptForPrint: 0, files: 3, stories: 5, leads: 1, spend: 1, remaining: false });
  assert.equal(books.size, 3);
  assert.deepEqual(removed, []);
});

test("purga: borra el caducado sin pagar, vacía el pagado (se queda el pedido) y no toca el vigente", async () => {
  const { db, books, removed, leads, spend } = fakeDb();
  const r = await purgeExpired(db, { now: NOW });
  assert.equal(r.deleted, 1);
  assert.equal(r.scrubbedPaid, 1);
  assert.equal(r.files, 3);
  assert.equal(r.stories, 5);
  assert.equal(books.has("a"), false, "sin pagar: fuera");
  assert.equal(books.get("b")?.status, "expired", "pagado: la fila se queda para el pedido");
  assert.equal(books.get("b")?.jobs, 0);
  assert.deepEqual(books.get("c")?.files, ["books/c/sheet-0-1-w.jpg"], "vigente: intacto");
  assert.deepEqual(removed.sort(), ["books/a/cover-0-1-y.jpg", "books/a/sheet-0-1-x.jpg", "books/b/page-1-1-z.jpg"]);
  // E18: fuera el email viejo sin novedades y sin libro vigente; se quedan el que aceptó novedades, el que tiene libro
  // vigente y el reciente
  assert.deepEqual(leads.map((l) => l.email).sort(), ["b@x.es", "c@x.es", "d@x.es"]);
  assert.deepEqual(spend.map((x) => x.lead_id), ["borrado", "libro-uuid", "d@x.es"]);
  // la segunda pasada no encuentra nada
  const again = await purgeExpired(db, { now: NOW });
  assert.deepEqual([again.deleted, again.scrubbedPaid, again.files, again.stories, again.leads, again.spend], [0, 0, 0, 0, 0, 0]);
});

test("purga: si se acaba el tiempo, lo dice y deja el resto para mañana", async () => {
  const { db, books } = fakeDb();
  const r = await purgeExpired(db, { deadline: Date.now() - 1 });
  assert.equal(r.remaining, true);
  assert.equal(books.size, 3);
});

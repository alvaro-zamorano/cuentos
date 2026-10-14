/** Borrado a 30 días (lib/purge.ts) con una base falsa: qué se borra, qué se vacía y qué se conserva. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { purgeExpired, type PurgeDb } from "../../lib/purge";

function fakeDb() {
  const books = new Map([
    ["a", { id: "a", publicId: "aaaaaaaa", expired: true, paid: false, status: "draft", files: ["books/a/sheet-0-1-x.jpg", "books/a/cover-0-1-y.jpg"], jobs: 2 }],
    ["b", { id: "b", publicId: "bbbbbbbb", expired: true, paid: true, status: "ready", files: ["books/b/page-1-1-z.jpg"], jobs: 14 }],
    ["c", { id: "c", publicId: "cccccccc", expired: false, paid: false, status: "draft", files: ["books/c/sheet-0-1-w.jpg"], jobs: 2 }],
  ]);
  const removed: string[] = [];
  let stories = 5;
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
  };
  return { db, books, removed };
}

test("purga: con dry=1 cuenta y no toca nada", async () => {
  const { db, books, removed } = fakeDb();
  const r = await purgeExpired(db, { dryRun: true });
  assert.deepEqual({ ...r }, { dryRun: true, deleted: 1, scrubbedPaid: 1, files: 3, stories: 5, remaining: false });
  assert.equal(books.size, 3);
  assert.deepEqual(removed, []);
});

test("purga: borra el caducado sin pagar, vacía el pagado (se queda el pedido) y no toca el vigente", async () => {
  const { db, books, removed } = fakeDb();
  const r = await purgeExpired(db);
  assert.equal(r.deleted, 1);
  assert.equal(r.scrubbedPaid, 1);
  assert.equal(r.files, 3);
  assert.equal(r.stories, 5);
  assert.equal(books.has("a"), false, "sin pagar: fuera");
  assert.equal(books.get("b")?.status, "expired", "pagado: la fila se queda para el pedido");
  assert.equal(books.get("b")?.jobs, 0);
  assert.deepEqual(books.get("c")?.files, ["books/c/sheet-0-1-w.jpg"], "vigente: intacto");
  assert.deepEqual(removed.sort(), ["books/a/cover-0-1-y.jpg", "books/a/sheet-0-1-x.jpg", "books/b/page-1-1-z.jpg"]);
  // la segunda pasada no encuentra nada
  const again = await purgeExpired(db);
  assert.deepEqual([again.deleted, again.scrubbedPaid, again.files, again.stories], [0, 0, 0, 0]);
});

test("purga: si se acaba el tiempo, lo dice y deja el resto para mañana", async () => {
  const { db, books } = fakeDb();
  const r = await purgeExpired(db, { deadline: Date.now() - 1 });
  assert.equal(r.remaining, true);
  assert.equal(books.size, 3);
});

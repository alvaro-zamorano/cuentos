/**
 * Borrar a quien lo pide por su email (menores de la auditoría 26 oct). Sin red: una base de mentira que apunta lo que se
 * le pide.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { forgetEmail, storyKey, type ForgetDb } from "../../lib/forget";
import { normalizeFicha, planCacheKey } from "../../lib/plan/ficha";
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
  assert.equal(storyKey(ficha), `plan:${planCacheKey(normalizeFicha(ficha))}`, "la misma clave que la caché de /api/plan");
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

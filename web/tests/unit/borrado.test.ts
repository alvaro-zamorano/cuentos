/**
 * Borrado a 30 días robusto (auditoría 26 oct, I11) y el libro impreso que se guarda para poder reimprimirlo (I29).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { KEEP_AFTER_SENT_DAYS, REPRINT_DAYS, purgeExpired, reprintUntil, supabasePurgeDb, type PurgeDb } from "../../lib/purge";
import type { Database } from "../../lib/supabase/types";

const DAY = 86_400_000;
const NOW = new Date("2026-10-27T12:00:00Z");

interface Book {
  id: string;
  publicId: string;
  expiresAt: string;
  paid: boolean;
  pending?: boolean;
  reprintUntil?: Date | null;
  files: string[];
  gone?: "deleted" | "scrubbed";
  stuck?: boolean;
}

/** Base falsa que respeta el orden por caducidad y el `after` de la consulta, como la de verdad. */
function fakeDb(list: Book[]) {
  const books = new Map(list.map((b) => [b.id, b]));
  const extended: Record<string, string> = {};
  const db: PurgeDb = {
    async expiredBooks(limit, after) {
      return [...books.values()]
        .filter((b) => !b.gone && b.expiresAt < NOW.toISOString())
        .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.id.localeCompare(b.id))
        .filter((b) => !after || b.expiresAt > after.expiresAt || (b.expiresAt === after.expiresAt && b.id > after.id))
        .slice(0, limit)
        .map(({ id, publicId, expiresAt }) => ({ id, publicId, expiresAt }));
    },
    async bookFiles(id) {
      return [...books.get(id)!.files];
    },
    async removeFiles(paths) {
      for (const p of paths) {
        const b = [...books.values()].find((x) => x.files.includes(p))!;
        if (b.stuck) throw new Error("storage.remove: The resource is locked");
        b.files = b.files.filter((f) => f !== p);
      }
    },
    async hasPaidOrder(id) {
      return books.get(id)!.paid;
    },
    async printPending(id) {
      return !!books.get(id)!.pending;
    },
    async keepForReprint(id) {
      return books.get(id)!.reprintUntil ?? null;
    },
    async extendBook(id, until) {
      extended[id] = until.toISOString();
      books.get(id)!.expiresAt = until.toISOString();
    },
    async deleteBook(id) {
      books.get(id)!.gone = "deleted";
    },
    async scrubPaidBook(id) {
      books.get(id)!.gone = "scrubbed";
    },
    scrubStories: async () => 0,
    scrubLeads: async () => 0,
    scrubSpend: async () => 0,
  };
  return { db, books, extended };
}

const book = (id: string, daysAgo: number, extra: Partial<Book> = {}): Book => ({
  id,
  publicId: `${id}xxxxxxxx`.slice(0, 8),
  expiresAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
  paid: false,
  files: [`books/${id}/sheet.jpg`],
  ...extra,
});

test("I11: un libro que no se deja borrar no para la pasada; se apunta y se sigue", async () => {
  const { db, books } = fakeDb([book("a", 5, { stuck: true }), book("b", 4), book("c", 3, { paid: true })]);
  const r = await purgeExpired(db, { now: NOW, deadline: Date.now() + 5_000 });
  assert.equal(r.failed, 1);
  assert.match(r.errors[0], /^ref\. axxxxx: storage\.remove/, "con la referencia corta, no el id que abre el libro");
  assert.equal(books.get("a")!.gone, undefined, "sigue ahí para mañana");
  assert.equal(books.get("b")!.gone, "deleted");
  assert.equal(books.get("c")!.gone, "scrubbed");
  assert.equal(r.deleted + r.scrubbedPaid, 3, "cuenta los tres intentos");
});

test("I11: cien tapas duras guardadas más antiguas no tapan a los cincuenta caducados normales", async () => {
  const kept = Array.from({ length: 100 }, (_, i) => book(`k${String(i).padStart(3, "0")}`, 60, { paid: true, pending: true }));
  const normal = Array.from({ length: 50 }, (_, i) => book(`n${String(i).padStart(3, "0")}`, 2));
  const { db, books } = fakeDb([...kept, ...normal]);
  const r = await purgeExpired(db, { now: NOW, batch: 100, deadline: Date.now() + 5_000 });
  assert.equal(r.keptForPrint, 100);
  assert.equal(r.deleted, 50);
  assert.ok(normal.every((b) => books.get(b.id)!.gone === "deleted"));
});

test("I29: hasta cuándo se guarda la tapa dura mandada: 14 días tras la entrega, como mucho 30 desde que salió", () => {
  const sent = "2026-10-01T10:00:00.000Z";
  assert.equal(reprintUntil({ sentAt: sent, deliveredAt: "2026-10-08T10:00:00.000Z" })!.toISOString(), new Date(Date.parse("2026-10-08T10:00:00.000Z") + REPRINT_DAYS * DAY).toISOString());
  assert.equal(reprintUntil({ sentAt: sent, deliveredAt: "2026-10-25T10:00:00.000Z" })!.toISOString(), new Date(Date.parse(sent) + KEEP_AFTER_SENT_DAYS * DAY).toISOString(), "con el tope de la política de privacidad");
  assert.equal(reprintUntil({ sentAt: sent, deliveredAt: null })!.toISOString(), new Date(Date.parse(sent) + KEEP_AFTER_SENT_DAYS * DAY).toISOString(), "sin entregar: el tope");
  assert.equal(reprintUntil({ sentAt: null, deliveredAt: null }), null);
});

test("I29: un libro impreso entregado hace poco no se vacía al caducar: se alarga y se vacía cuando acaba el plazo", async () => {
  const until = new Date(NOW.getTime() + 6 * DAY);
  const { db, books, extended } = fakeDb([book("r", 1, { paid: true, reprintUntil: until, files: ["books/r/imprenta-1.pdf"] })]);
  const r = await purgeExpired(db, { now: NOW, deadline: Date.now() + 5_000 });
  assert.equal(r.keptForReprint, 1);
  assert.equal(books.get("r")!.gone, undefined);
  assert.deepEqual(books.get("r")!.files, ["books/r/imprenta-1.pdf"], "el PDF de imprenta sigue");
  assert.equal(extended.r, until.toISOString());
  // pasado el plazo
  const later = new Date(until.getTime() + DAY);
  const { db: db2, books: books2 } = fakeDb([book("r", 1, { paid: true, reprintUntil: until })]);
  const r2 = await purgeExpired(db2, { now: later, deadline: Date.now() + 5_000 });
  assert.equal(r2.scrubbedPaid, 1);
  assert.equal(books2.get("r")!.gone, "scrubbed");
});

test("I29: en dry-run se cuenta lo que se guardaría, sin alargar nada", async () => {
  const until = new Date(NOW.getTime() + 6 * DAY);
  const { db, extended } = fakeDb([book("r", 1, { paid: true, reprintUntil: until })]);
  const r = await purgeExpired(db, { now: NOW, dryRun: true });
  assert.equal(r.keptForReprint, 1);
  assert.deepEqual(extended, {});
});

/** Cliente de Supabase real con un `fetch` que graba las peticiones y responde lo que diga `reply`. */
function recording(reply: (url: URL, method: string, body: unknown) => unknown) {
  const calls: { method: string; url: URL; body: unknown }[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, url, body });
    return new Response(JSON.stringify(reply(url, method, body)), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { db: createClient<Database>("https://x.supabase.co", "k", { global: { fetch }, auth: { persistSession: false } }), calls };
}

test("I11 en Supabase: la consulta de caducados sigue detrás del último, con la fecha entre comillas", async () => {
  const { db, calls } = recording(() => [{ id: "b2", public_id: "bbbbbbbb", expires_at: "2026-10-20T10:00:00.123456+00:00" }]);
  const purge = supabasePurgeDb(db, {});
  const page = await purge.expiredBooks(100, { expiresAt: "2026-10-20T10:00:00.123456+00:00", id: "b1" });
  assert.deepEqual(page, [{ id: "b2", publicId: "bbbbbbbb", expiresAt: "2026-10-20T10:00:00.123456+00:00" }]);
  const q = calls[0].url.searchParams;
  assert.equal(q.get("or"), '(expires_at.gt."2026-10-20T10:00:00.123456+00:00",and(expires_at.eq."2026-10-20T10:00:00.123456+00:00",id.gt.b1))');
  assert.equal(q.get("order"), "expires_at.asc,id.asc");
});

test("I11 en Supabase: los archivos de las subcarpetas del libro también se borran", async () => {
  const { db } = recording((url, _m, body) => {
    const prefix = (body as { prefix?: string } | null)?.prefix;
    if (!url.pathname.includes("/storage/v1/object/list/")) return [];
    if (prefix === "books/x") return [{ id: "1", name: "sheet.jpg" }, { id: null, name: "descargas" }];
    if (prefix === "books/x/descargas") return [{ id: "2", name: "libro.pdf" }];
    return [];
  });
  assert.deepEqual(await supabasePurgeDb(db, {}).bookFiles("x"), ["books/x/sheet.jpg", "books/x/descargas/libro.pdf"]);
});

test("I11 en Supabase: al borrar o vaciar un libro, sus notas de «Otra versión» se vacían antes", async () => {
  const { db, calls } = recording(() => []);
  const purge = supabasePurgeDb(db, {});
  await purge.deleteBook("b1");
  assert.equal(calls[0].url.pathname.split("/").pop(), "cuentos_feedback");
  assert.deepEqual(calls[0].body, { note: null, book_id: null, job_id: null });
  assert.equal(calls[0].url.searchParams.get("book_id"), "eq.b1");
  assert.equal(calls[1].method, "DELETE");
  calls.length = 0;
  await purge.scrubPaidBook("b1");
  assert.equal(calls[0].url.pathname.split("/").pop(), "cuentos_feedback");
});

test("I11 en Supabase: los leads que se quedan (con libro vigente) no tapan a los siguientes", async () => {
  const first = Array.from({ length: 200 }, (_, i) => ({ id: i + 1, email: `vivo${i}@x.es` }));
  const { db, calls } = recording((url, method) => {
    const table = url.pathname.split("/").pop();
    if (table === "cuentos_leads" && method === "GET") return url.searchParams.get("id") === "gt.0" ? first : [{ id: 201, email: "viejo@x.es" }];
    if (table === "cuentos_books") return url.searchParams.get("email")?.includes("viejo") ? [] : first.map((l) => ({ email: l.email }));
    return [];
  });
  const n = await supabasePurgeDb(db, {}).scrubLeads(new Date(NOW.getTime() - 30 * DAY), false);
  assert.equal(n, 1);
  const del = calls.find((c) => c.method === "DELETE")!;
  assert.equal(del.url.searchParams.get("id"), "in.(201)");
});

test("I29 en Supabase: la fecha sale del pedido de este entorno (salida y entrega)", async () => {
  const rows = [
    { stripe_session_id: "cs_live_1", print_sent_at: "2026-10-01T10:00:00Z", print_info: { steps: { delivered: "2026-10-09T10:00:00Z" } } },
    { stripe_session_id: "cs_test_9", print_sent_at: "2026-10-20T10:00:00Z", print_info: null },
  ];
  const { db, calls } = recording(() => rows);
  const until = await supabasePurgeDb(db, { VERCEL_ENV: "production" }).keepForReprint!("b1", NOW);
  assert.equal(until!.toISOString(), new Date(Date.parse("2026-10-09T10:00:00Z") + REPRINT_DAYS * DAY).toISOString(), "la de prueba no cuenta en producción");
  assert.equal(calls[0].url.searchParams.get("print_status"), "in.(sent,in_production,shipped,delivered,returned,canceled)", "también lo devuelto o cancelado por la imprenta");
  // alargar nunca acorta
  const ext = recording(() => []);
  await supabasePurgeDb(ext.db, {}).extendBook!("b1", new Date("2026-11-01T00:00:00Z"));
  assert.equal(ext.calls[0].url.searchParams.get("expires_at"), "lt.2026-11-01T00:00:00.000Z");
});

test("revisión: un paso que falla no se salta los demás, y un libro colgado no se come la pasada", async () => {
  const { db } = fakeDb([book("h", 3), book("b", 2)]);
  let leads = 0;
  db.scrubStories = async () => {
    throw new Error("stories: timeout");
  };
  db.scrubLeads = async () => (leads++, 2);
  // Storage no contesta para el primer libro
  const remove = db.removeFiles;
  db.removeFiles = async (paths) => (paths[0].startsWith("books/h/") ? new Promise(() => undefined) : remove(paths));
  const t0 = Date.now();
  const r = await purgeExpired(db, { now: NOW, deadline: Date.now() + 5_000, bookTimeoutMs: 200 });
  assert.ok(Date.now() - t0 < 3_000);
  assert.equal(r.failed, 2);
  assert.match(r.errors.join("\n"), /hxxxxx: sin respuesta/);
  assert.match(r.errors.join("\n"), /^cuentos: stories: timeout/m);
  assert.equal(r.deleted, 2, "el segundo libro se borra igual");
  assert.equal(leads, 1, "los leads se miran aunque fallen los cuentos");
  assert.equal(r.leads, 2);
});

test("revisión: al vaciar un libro pagado, sus pedidos pierden la dirección y el seguimiento, lleguen o no a «entregado»", async () => {
  const { db, calls } = recording((url, method) => {
    const table = url.pathname.split("/").pop();
    if (table === "cuentos_orders" && method === "GET") return [{ id: "o1", print_info: { trackingCode: "TR1", steps: { sent: "x" } } }];
    return [];
  });
  await supabasePurgeDb(db, {}).scrubPaidBook("b1");
  const ups = calls.filter((c) => c.method === "PATCH" && c.url.pathname.endsWith("cuentos_orders"));
  assert.equal(ups.length, 1);
  assert.equal(ups[0].url.searchParams.get("id"), "eq.o1");
  assert.deepEqual(ups[0].body, { shipping: null, print_tracking_url: null, print_info: { steps: { sent: "x" } } });
});

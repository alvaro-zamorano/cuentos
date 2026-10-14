/**
 * Borrado a 30 días (lo que promete el consentimiento del paso 4). Lo lanza el cron diario de Vercel (/api/cron/purge).
 *
 * - Libro caducado sin pagar: se borran sus imágenes del bucket y la fila (los jobs caen en cascada).
 * - Libro caducado pagado: el pedido se conserva (contabilidad), así que la fila queda vacía: sin ficha ni plan
 *   (draft = {}), sin jobs y sin imágenes, con estado `expired`. Se queda el email del cliente junto al pedido.
 * - Planes cacheados en cuentos_stories con más de 30 días: se vacían la ficha y el cuento; se quedan coste y modelo.
 *
 * El acceso a la base se inyecta (PurgeDb) para probarlo sin Supabase.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { BUCKET } from "./generation/store";

export interface ExpiredBook {
  id: string;
  publicId: string;
}

export interface PurgeDb {
  /** Libros con expires_at pasado y estado distinto de `expired` (hasta `limit`). */
  expiredBooks(limit: number): Promise<ExpiredBook[]>;
  /** Rutas de los archivos del bucket de un libro (carpeta books/<id>). */
  bookFiles(bookId: string): Promise<string[]>;
  removeFiles(paths: string[]): Promise<void>;
  hasPaidOrder(bookId: string): Promise<boolean>;
  deleteBook(bookId: string): Promise<void>;
  /** draft = {}, status = expired, sin jobs. */
  scrubPaidBook(bookId: string): Promise<void>;
  /** Vacía input y story de los planes anteriores a `before` (con `dryRun`, solo los cuenta); devuelve cuántos. */
  scrubStories(before: Date, dryRun: boolean): Promise<number>;
}

export interface PurgeReport {
  dryRun: boolean;
  deleted: number;
  scrubbedPaid: number;
  files: number;
  stories: number;
  remaining: boolean;
}

export const RETENTION_DAYS = 30;

export async function purgeExpired(db: PurgeDb, { dryRun = false, now = new Date(), batch = 100, deadline = Date.now() + 50_000 }: { dryRun?: boolean; now?: Date; batch?: number; deadline?: number } = {}): Promise<PurgeReport> {
  const report: PurgeReport = { dryRun, deleted: 0, scrubbedPaid: 0, files: 0, stories: 0, remaining: false };
  const seen = new Set<string>();
  while (Date.now() < deadline) {
    const books = (await db.expiredBooks(batch)).filter((b) => !seen.has(b.id));
    if (books.length === 0) break;
    for (const b of books) {
      if (Date.now() >= deadline) {
        report.remaining = true;
        break;
      }
      seen.add(b.id);
      const files = await db.bookFiles(b.id);
      report.files += files.length;
      const paid = await db.hasPaidOrder(b.id);
      if (paid) report.scrubbedPaid++;
      else report.deleted++;
      if (dryRun) continue;
      // primero las imágenes: si falla, la fila sigue y se reintenta mañana
      if (files.length) await db.removeFiles(files);
      if (paid) await db.scrubPaidBook(b.id);
      else await db.deleteBook(b.id);
    }
    if (dryRun) {
      report.remaining = books.length >= batch;
      break;
    }
    if (report.remaining) break;
  }
  if (Date.now() >= deadline) report.remaining = true;
  report.stories = await db.scrubStories(new Date(now.getTime() - RETENTION_DAYS * 86_400_000), dryRun);
  return report;
}

/* ------------------------------ Supabase ------------------------------ */


export function supabasePurgeDb(db: SupabaseClient<Database>): PurgeDb {
  const must = (error: { message: string } | null, what: string) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };
  return {
    async expiredBooks(limit) {
      const { data, error } = await db.from("cuentos_books").select("id, public_id").lt("expires_at", new Date().toISOString()).neq("status", "expired").order("expires_at").limit(limit);
      must(error, "books");
      return (data ?? []).map((b) => ({ id: b.id, publicId: b.public_id }));
    },
    async bookFiles(bookId) {
      const { data, error } = await db.storage.from(BUCKET).list(`books/${bookId}`, { limit: 1000 });
      must(error, "storage.list");
      return (data ?? []).filter((f) => f.id).map((f) => `books/${bookId}/${f.name}`);
    },
    async removeFiles(paths) {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 100));
        must(error, "storage.remove");
      }
    },
    async hasPaidOrder(bookId) {
      const { data, error } = await db.from("cuentos_orders").select("id").eq("book_id", bookId).eq("status", "paid").limit(1);
      must(error, "orders");
      return !!data && data.length > 0;
    },
    async deleteBook(bookId) {
      const { error } = await db.from("cuentos_books").delete().eq("id", bookId);
      must(error, "books.delete");
    },
    async scrubPaidBook(bookId) {
      const jobs = await db.from("cuentos_generation_jobs").delete().eq("book_id", bookId);
      must(jobs.error, "jobs.delete");
      const { error } = await db.from("cuentos_books").update({ draft: {}, status: "expired" }).eq("id", bookId);
      must(error, "books.scrub");
    },
    async scrubStories(before, dryRun) {
      const q = () => db.from("cuentos_stories").select("id", { count: "exact", head: true }).lt("created_at", before.toISOString()).neq("input", "{}");
      if (dryRun) {
        const { count, error } = await q();
        must(error, "stories.count");
        return count ?? 0;
      }
      const { data, error } = await db.from("cuentos_stories").update({ input: {}, story: {} }).lt("created_at", before.toISOString()).neq("input", "{}").select("id");
      must(error, "stories.scrub");
      return data?.length ?? 0;
    },
  };
}

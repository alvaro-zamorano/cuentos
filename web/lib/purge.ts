/**
 * Borrado a 30 días (lo que promete el consentimiento del paso 4). Lo lanza el cron diario de Vercel (/api/cron/purge).
 *
 * - Libro caducado sin pagar: se borran sus imágenes del bucket y la fila (los jobs caen en cascada).
 * - Libro caducado pagado: el pedido se conserva (contabilidad), así que la fila queda vacía: sin ficha ni plan
 *   (draft = {}), sin jobs y sin imágenes, con estado `expired`. Se queda el email del cliente junto al pedido.
 * - Planes cacheados en cuentos_stories con más de 30 días: se vacían la ficha y el cuento; se quedan coste y modelo.
 * - Emails sin consentimiento de novedades (E18, 16 oct): la fila de cuentos_leads se borra a los 30 días si ese email
 *   ya no tiene ningún libro vigente. Con consentimiento, se queda hasta la baja.
 * - Gasto (cuentos_spend) con más de 30 días: el email del lead se sustituye por «borrado»; se quedan importe y fecha.
 * - Motivos de «Otra versión» y avisos (cuentos_feedback) con más de 30 días: se vacía la nota del padre y la fila se
 *   desliga del libro y del job; se quedan el motivo, la página, la versión, el estilo y la fecha.
 *   El tope por lead vuelve a empezar para ese email, lo que se acepta.
 * - Libro impreso (B8) que todavía no ha salido hacia la imprenta (el padre no lo ha mandado a imprimir, o falló el envío):
 *   no se toca hasta que salga, porque sin las imágenes no se puede imprimir. Al vaciar un libro pagado se borra también
 *   la dirección de envío del pedido, salvo que el libro esté de camino.
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
  /** Tapa dura pagada que aún no ha salido hacia la imprenta: se conserva. */
  printPending?(bookId: string): Promise<boolean>;
  deleteBook(bookId: string): Promise<void>;
  /** draft = {}, status = expired, sin jobs. */
  scrubPaidBook(bookId: string): Promise<void>;
  /** Vacía input y story de los planes anteriores a `before` (con `dryRun`, solo los cuenta); devuelve cuántos. */
  scrubStories(before: Date, dryRun: boolean): Promise<number>;
  /** Borra los leads sin consentimiento de novedades anteriores a `before` sin libro vigente; devuelve cuántos. */
  scrubLeads(before: Date, dryRun: boolean): Promise<number>;
  /** Quita el email de las filas de gasto anteriores a `before`; devuelve cuántas. */
  scrubSpend(before: Date, dryRun: boolean): Promise<number>;
  /** Vacía la nota y desliga del libro las filas de cuentos_feedback anteriores a `before`; devuelve cuántas. */
  scrubFeedback?(before: Date, dryRun: boolean): Promise<number>;
}

export interface PurgeReport {
  dryRun: boolean;
  deleted: number;
  scrubbedPaid: number;
  /** Caducados que se conservan porque su libro impreso aún no ha ido a la imprenta. */
  keptForPrint: number;
  files: number;
  stories: number;
  leads: number;
  spend: number;
  feedback: number;
  remaining: boolean;
}

export const RETENTION_DAYS = 30;

/** Lo que queda en cuentos_spend.lead_id cuando se quita el email. */
export const ANON_LEAD = "borrado";

export async function purgeExpired(db: PurgeDb, { dryRun = false, now = new Date(), batch = 100, deadline = Date.now() + 50_000 }: { dryRun?: boolean; now?: Date; batch?: number; deadline?: number } = {}): Promise<PurgeReport> {
  const report: PurgeReport = { dryRun, deleted: 0, scrubbedPaid: 0, keptForPrint: 0, files: 0, stories: 0, leads: 0, spend: 0, feedback: 0, remaining: false };
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
      if (await db.printPending?.(b.id)) {
        report.keptForPrint++;
        continue;
      }
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
  const before = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  report.stories = await db.scrubStories(before, dryRun);
  // después de los libros: un email cuyo último libro acaba de caducar ya no tiene libro vigente
  report.leads = await db.scrubLeads(before, dryRun);
  report.spend = await db.scrubSpend(before, dryRun);
  report.feedback = (await db.scrubFeedback?.(before, dryRun)) ?? 0;
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
    async printPending(bookId) {
      const { data, error } = await db
        .from("cuentos_orders")
        .select("id")
        .eq("book_id", bookId)
        .eq("status", "paid")
        .eq("edition", "hardcover")
        .in("print_status", ["awaiting_approval", "sending", "failed"])
        .limit(1);
      must(error, "orders.print");
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
      // la dirección de envío solo hace falta mientras el libro viaja
      const ship = await db.from("cuentos_orders").update({ shipping: null }).eq("book_id", bookId).or("print_status.is.null,print_status.in.(delivered,canceled,returned)");
      must(ship.error, "orders.shipping");
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
    async scrubLeads(before, dryRun) {
      // por tandas de 200: la lista de emails va en la URL del filtro
      const { data: leads, error } = await db.from("cuentos_leads").select("id, email").eq("marketing", false).lt("created_at", before.toISOString()).order("created_at").limit(200);
      must(error, "leads");
      if (!leads?.length) return 0;
      const emails = [...new Set(leads.map((l) => l.email))];
      const live = await db.from("cuentos_books").select("email").in("email", emails).gt("expires_at", new Date().toISOString());
      must(live.error, "books.live");
      const keep = new Set((live.data ?? []).map((b) => b.email));
      const ids = leads.filter((l) => !keep.has(l.email)).map((l) => l.id);
      if (dryRun || ids.length === 0) return ids.length;
      const del = await db.from("cuentos_leads").delete().in("id", ids);
      must(del.error, "leads.delete");
      return ids.length;
    },
    async scrubSpend(before, dryRun) {
      if (dryRun) {
        const { count, error } = await db.from("cuentos_spend").select("id", { count: "exact", head: true }).like("lead_id", "%@%").lt("created_at", before.toISOString());
        must(error, "spend.count");
        return count ?? 0;
      }
      const { data, error } = await db.from("cuentos_spend").update({ lead_id: ANON_LEAD }).like("lead_id", "%@%").lt("created_at", before.toISOString()).select("id");
      must(error, "spend.scrub");
      return data?.length ?? 0;
    },
    async scrubFeedback(before, dryRun) {
      // lo que aún lleva nota o está ligado a un libro o un job (si el libro se borró, la fila ya quedó sin libro)
      const pending = "book_id.not.is.null,job_id.not.is.null,note.not.is.null";
      const old = () => db.from("cuentos_feedback").select("id", { count: "exact", head: true }).lt("created_at", before.toISOString()).or(pending);
      if (dryRun) {
        const { count, error } = await old();
        must(error, "feedback.count");
        return count ?? 0;
      }
      const { data, error } = await db
        .from("cuentos_feedback")
        .update({ note: null, book_id: null, job_id: null })
        .lt("created_at", before.toISOString())
        .or(pending)
        .select("id");
      must(error, "feedback.scrub");
      return data?.length ?? 0;
    },
  };
}

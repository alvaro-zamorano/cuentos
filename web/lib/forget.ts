/**
 * Borrar a alguien que lo pide (derecho de supresión; menores de la auditoría 26 oct: «no hay forma de borrar a alguien
 * que lo pida»). Lo lanza Álvaro a mano con `scripts/borrar-email.mts`; sin `--de-verdad` solo cuenta.
 *
 * Por el email (y sus variantes del mismo buzón: mayúsculas, `+algo`, puntos de Gmail, googlemail.com):
 * - Sus libros sin pagar: fuera las imágenes del bucket y la fila (trabajos en cascada; las notas de «Otra versión», sin
 *   nota ni libro).
 * - Sus libros pagados: se vacían como en el borrado a 30 días (sin ficha, plan, trabajos, imágenes ni dirección). El
 *   pedido se queda, con el email, el importe y la fecha: lo pide la normativa fiscal y lo dice /privacidad §4.
 *   Una tapa dura pagada que aún no ha salido hacia la imprenta no se toca sin `--aunque-no-se-haya-impreso`: sin sus
 *   imágenes ya no se puede imprimir (hay que hablarlo con el cliente y devolverla).
 * - Sus cuentos escritos (`cuentos_stories`): no guardan el email ni el libro; se encuentran por la huella de la ficha de
 *   cada libro (la misma clave de la caché de /api/plan). Las versiones anteriores de un cuento que se cambió después ya
 *   no se pueden encontrar así; se borran solas a los 30 días.
 * - Sus filas de novedades (`cuentos_leads`) y el email en el gasto del flujo antiguo (`cuentos_spend`, queda «borrado»).
 *
 * El acceso a la base se inyecta (ForgetDb) para probarlo sin Supabase.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { normalizeEmail } from "./emailNorm";
import { planCacheKey, normalizeFicha } from "./plan/ficha";
import { ANON_LEAD, supabasePurgeDb, type PurgeDb } from "./purge";

export interface ForgetBook {
  id: string;
  publicId: string;
  /** La ficha del borrador, para encontrar su cuento escrito; null en un libro ya vaciado. */
  ficha: unknown | null;
}

export interface ForgetDb extends Pick<PurgeDb, "bookFiles" | "removeFiles" | "hasPaidOrder" | "printPending" | "deleteBook" | "scrubPaidBook"> {
  /** Los libros cuyo email es de ese buzón (`email_norm`). */
  booksOf(emailNorm: string): Promise<ForgetBook[]>;
  /** Borra los cuentos escritos con esas claves de caché; devuelve cuántos. Con `dryRun`, solo los cuenta. */
  deleteStories(keys: string[], dryRun: boolean): Promise<number>;
  /** Borra las filas de leads de ese buzón; devuelve cuántas. Con `dryRun`, solo las cuenta. */
  deleteLeads(emailNorm: string, dryRun: boolean): Promise<number>;
  /** Cambia el email de ese buzón por «borrado» en el gasto; devuelve cuántas filas. Con `dryRun`, solo las cuenta. */
  anonymizeSpend(emailNorm: string, dryRun: boolean): Promise<number>;
}

export interface ForgetReport {
  dryRun: boolean;
  /** Libros sin pagar borrados (o que se borrarían). */
  deleted: number;
  /** Libros pagados vaciados; su pedido se queda. */
  scrubbed: number;
  /** Tapas duras pagadas sin imprimir que no se han tocado (referencia corta de cada una). */
  skippedPrint: string[];
  files: number;
  stories: number;
  leads: number;
  spend: number;
}

/** La clave de caché de /api/plan para la ficha de un libro (app/api/plan/route.ts). */
export function storyKey(ficha: unknown): string | null {
  if (!ficha || typeof ficha !== "object") return null;
  return `plan:${planCacheKey(normalizeFicha(ficha))}`;
}

export async function forgetEmail(db: ForgetDb, email: string, { dryRun = true, evenIfNotPrinted = false }: { dryRun?: boolean; evenIfNotPrinted?: boolean } = {}): Promise<ForgetReport> {
  const norm = normalizeEmail(email);
  if (!norm.includes("@")) throw new Error("email no válido");
  const report: ForgetReport = { dryRun, deleted: 0, scrubbed: 0, skippedPrint: [], files: 0, stories: 0, leads: 0, spend: 0 };
  const books = await db.booksOf(norm);
  const keys = new Set<string>();
  for (const b of books) {
    const key = storyKey(b.ficha);
    if (key) keys.add(key);
    const paid = await db.hasPaidOrder(b.id);
    if (paid && !evenIfNotPrinted && (await db.printPending?.(b.id))) {
      report.skippedPrint.push(`ref. ${b.id.slice(0, 8)}`);
      continue;
    }
    const files = await db.bookFiles(b.id);
    report.files += files.length;
    if (!dryRun && files.length > 0) await db.removeFiles(files);
    if (paid) {
      if (!dryRun) await db.scrubPaidBook(b.id);
      report.scrubbed++;
    } else {
      if (!dryRun) await db.deleteBook(b.id);
      report.deleted++;
    }
  }
  report.stories = await db.deleteStories([...keys], dryRun);
  report.leads = await db.deleteLeads(norm, dryRun);
  report.spend = await db.anonymizeSpend(norm, dryRun);
  return report;
}

/** Los dominios con los que se puede haber escrito un buzón (gmail.com y googlemail.com son el mismo). */
function domainsOf(norm: string): string[] {
  const domain = norm.slice(norm.lastIndexOf("@") + 1);
  return domain === "gmail.com" ? ["gmail.com", "googlemail.com"] : [domain];
}

export function supabaseForgetDb(db: SupabaseClient<Database>, env: Record<string, string | undefined> = process.env): ForgetDb {
  const purge = supabasePurgeDb(db, env);
  const must = (error: { message: string } | null, what: string) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };
  /** Valores de una columna de email que son de ese buzón (por dominio, y después normalizados aquí). */
  const sameMailbox = async (table: "cuentos_leads" | "cuentos_spend", column: "email" | "lead_id", norm: string): Promise<string[]> => {
    const out: string[] = [];
    for (const d of domainsOf(norm)) {
      const { data, error } = await db.from(table).select(column).ilike(column, `%@${d}`).limit(5000);
      must(error, table);
      for (const r of (data ?? []) as unknown as Record<string, string>[]) if (normalizeEmail(r[column]) === norm) out.push(r[column]);
    }
    return [...new Set(out)];
  };
  return {
    bookFiles: purge.bookFiles,
    removeFiles: purge.removeFiles,
    hasPaidOrder: purge.hasPaidOrder,
    printPending: purge.printPending,
    deleteBook: purge.deleteBook,
    scrubPaidBook: purge.scrubPaidBook,
    async booksOf(norm) {
      const { data, error } = await db.from("cuentos_books").select("id, public_id, ficha:draft->ficha").eq("email_norm", norm).limit(500);
      must(error, "books");
      return ((data ?? []) as unknown as { id: string; public_id: string; ficha: unknown }[]).map((b) => ({ id: b.id, publicId: b.public_id, ficha: b.ficha ?? null }));
    },
    async deleteStories(keys, dryRun) {
      if (keys.length === 0) return 0;
      if (dryRun) {
        const { count, error } = await db.from("cuentos_stories").select("id", { count: "exact", head: true }).in("input_hash", keys);
        must(error, "stories.count");
        return count ?? 0;
      }
      const { data, error } = await db.from("cuentos_stories").delete().in("input_hash", keys).select("id");
      must(error, "stories.delete");
      return data?.length ?? 0;
    },
    async deleteLeads(norm, dryRun) {
      const emails = await sameMailbox("cuentos_leads", "email", norm);
      if (dryRun || emails.length === 0) return emails.length;
      const { data, error } = await db.from("cuentos_leads").delete().in("email", emails).select("id");
      must(error, "leads.delete");
      return data?.length ?? 0;
    },
    async anonymizeSpend(norm, dryRun) {
      const emails = await sameMailbox("cuentos_spend", "lead_id", norm);
      if (emails.length === 0) return 0;
      if (dryRun) {
        const { count, error } = await db.from("cuentos_spend").select("id", { count: "exact", head: true }).in("lead_id", emails);
        must(error, "spend.count");
        return count ?? 0;
      }
      const { data, error } = await db.from("cuentos_spend").update({ lead_id: ANON_LEAD }).in("lead_id", emails).select("id");
      must(error, "spend.update");
      return data?.length ?? 0;
    },
  };
}

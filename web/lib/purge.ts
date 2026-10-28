/**
 * Borrado a 30 días (lo que promete el consentimiento del paso 4). Lo lanza el cron diario de Vercel (/api/cron/purge).
 *
 * - Libro caducado sin pagar: se borran sus imágenes del bucket y la fila (los jobs caen en cascada).
 * - Libro caducado pagado: el pedido se conserva (contabilidad), así que la fila queda vacía: sin ficha ni plan
 *   (draft = {}), sin jobs y sin imágenes, con estado `expired`. Se queda el email del cliente junto al pedido. En
 *   producción solo cuenta un cobro real: un libro pagado con la tarjeta de prueba de la preview se borra entero, como uno
 *   sin pagar (un cobro de prueba no hay que guardarlo; 28 oct, ESTADO §4.38).
 * - Cuentos escritos (cuentos_stories) con más de 30 días: se borra la fila entera (auditoría 26 oct, I24). Antes se vaciaban
 *   la ficha y el cuento, pero quedaban los avisos del modelo, con nombres, y una huella que se revertía. El coste ya
 *   está en cuentos_spend.
 * - Direcciones (auditoría 26 oct, I23): al entregarse el paquete se quitan del pedido la dirección, el teléfono y el
 *   seguimiento, aunque el libro siga vigente. Y un borrador que lleva más de un día con dirección la pierde: o el pago
 *   se abandonó, o ya está copiada en el pedido.
 * - Emails sin consentimiento de novedades (E18, 16 oct): la fila de cuentos_leads se borra a los 30 días si ese email
 *   ya no tiene ningún libro vigente. Con consentimiento, se queda hasta la baja.
 * - Gasto (cuentos_spend) con más de 30 días: el email del lead se sustituye por «borrado»; se quedan importe y fecha.
 * - Motivos de «Otra versión» y avisos (cuentos_feedback) con más de 30 días: se vacía la nota del padre y la fila se
 *   desliga del libro y del job; se quedan el motivo, la página, la versión, el estilo y la fecha.
 *   El tope por lead vuelve a empezar para ese email, lo que se acepta.
 * - Libro impreso (B8) que todavía no ha salido hacia la imprenta (el padre no lo ha mandado a imprimir, o falló el envío):
 *   no se toca hasta que salga, porque sin las imágenes no se puede imprimir. Al vaciar un libro pagado se borra también
 *   la dirección de envío del pedido, salvo que el libro esté de camino.
 * - Libro impreso ya mandado (auditoría 26 oct, I29): se guarda hasta 14 días después de la entrega, que es el plazo para
 *   pedir que se reimprima (/condiciones §9), y como mucho 30 días desde que salió hacia la imprenta (/privacidad §4 y /condiciones §10). Se
 *   alarga su caducidad y se vuelve a mirar entonces.
 * - Al borrar o vaciar un libro, sus motivos de «Otra versión» pierden la nota y la relación con él (no esperan a sus 30
 *   días).
 *
 * Robustez (auditoría 26 oct, I11): un libro que falla no para la pasada (se apunta y se sigue con el siguiente, y la ruta
 * avisa a soporte), y los libros que se conservan no tapan a los demás: la consulta avanza por caducidad.
 *
 * El acceso a la base se inyecta (PurgeDb) para probarlo sin Supabase.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./supabase/types";
import { BUCKET } from "./generation/store";
import { paidInEnv } from "./stripe";
import { DISPUTE_HOLD } from "./print/types";

export interface ExpiredBook {
  id: string;
  publicId: string;
  /** Para seguir la consulta después de este (sin valor, la base falsa de los tests). */
  expiresAt?: string;
}

/** Plazos del libro impreso ya mandado (I29). */
export const REPRINT_DAYS = 14;
export const KEEP_AFTER_SENT_DAYS = 30;

export interface PurgeDb {
  /**
   * Libros con expires_at pasado y estado distinto de `expired` (hasta `limit`), por orden de caducidad y, con `after`,
   * solo los que van detrás de ese.
   */
  expiredBooks(limit: number, after?: { expiresAt: string; id: string }): Promise<ExpiredBook[]>;
  /** Rutas de los archivos del bucket de un libro (carpeta books/<id>, con sus subcarpetas). */
  bookFiles(bookId: string): Promise<string[]>;
  removeFiles(paths: string[]): Promise<void>;
  hasPaidOrder(bookId: string): Promise<boolean>;
  /** Tapa dura pagada que aún no ha salido hacia la imprenta: se conserva. */
  printPending?(bookId: string): Promise<boolean>;
  /**
   * Tapa dura ya mandada: hasta cuándo se guarda para poder reimprimirla (I29). null si no hay ninguna de este entorno.
   * Lo calcula `reprintUntil` con las fechas del pedido.
   */
  keepForReprint?(bookId: string, now: Date): Promise<Date | null>;
  /** Mueve la caducidad del libro (para volver a mirarlo entonces). */
  extendBook?(bookId: string, until: Date): Promise<void>;
  deleteBook(bookId: string): Promise<void>;
  /** draft = {}, status = expired, sin jobs. También vacía las notas de sus motivos de «Otra versión». */
  scrubPaidBook(bookId: string): Promise<void>;
  /** Borra los cuentos escritos anteriores a `before` (con `dryRun`, solo los cuenta); devuelve cuántos. */
  scrubStories(before: Date, dryRun: boolean): Promise<number>;
  /**
   * Quita la dirección, el teléfono y el seguimiento de los pedidos entregados, y la dirección de los borradores que no se
   * tocan desde antes de `draftBefore`; devuelve cuántas filas.
   */
  scrubShipping?(draftBefore: Date, dryRun: boolean): Promise<number>;
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
  /** Caducados que se conservan para poder reimprimir el libro impreso (I29). */
  keptForReprint: number;
  /** Libros que han fallado en esta pasada (se reintentan mañana; la ruta avisa a soporte). */
  failed: number;
  /** Los primeros errores, sin datos personales: id corto del libro y el fallo. */
  errors: string[];
  files: number;
  stories: number;
  leads: number;
  spend: number;
  feedback: number;
  shipping: number;
  remaining: boolean;
}

export const RETENTION_DAYS = 30;

/** Lo que queda en cuentos_spend.lead_id cuando se quita el email. */
export const ANON_LEAD = "borrado";

export async function purgeExpired(
  db: PurgeDb,
  { dryRun = false, now = new Date(), batch = 100, deadline = Date.now() + 50_000, bookTimeoutMs = 20_000 }: { dryRun?: boolean; now?: Date; batch?: number; deadline?: number; bookTimeoutMs?: number } = {},
): Promise<PurgeReport> {
  const report: PurgeReport = { dryRun, deleted: 0, scrubbedPaid: 0, keptForPrint: 0, keptForReprint: 0, failed: 0, errors: [], files: 0, stories: 0, leads: 0, spend: 0, feedback: 0, shipping: 0, remaining: false };
  const seen = new Set<string>();
  let after: { expiresAt: string; id: string } | undefined;
  while (Date.now() < deadline) {
    const page = await db.expiredBooks(batch, after);
    const books = page.filter((b) => !seen.has(b.id));
    if (books.length === 0) break;
    // la siguiente consulta empieza detrás del último: lo que se conserva o falla no vuelve a llenar la tanda (I11)
    const last = page[page.length - 1];
    after = last.expiresAt ? { expiresAt: last.expiresAt, id: last.id } : undefined;
    for (const b of books) {
      if (Date.now() >= deadline) {
        report.remaining = true;
        break;
      }
      seen.add(b.id);
      try {
        // con plazo propio: una llamada a Storage colgada no se come la pasada entera (revisión 27 oct)
        await withTimeout(purgeBook(db, b, report, dryRun, now), bookTimeoutMs);
      } catch (e) {
        // un libro que falla (un archivo que Storage no deja borrar) no para la pasada: se reintenta mañana. En el aviso,
        // la referencia del id interno: el público abre el libro (I30)
        failed(report, `ref. ${b.id.slice(0, 8)}`, e);
      }
    }
    if (dryRun) {
      report.remaining = page.length >= batch;
      break;
    }
    if (report.remaining) break;
  }
  if (Date.now() >= deadline) report.remaining = true;
  const before = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
  // cada paso por su cuenta: si uno falla, los demás se hacen igual (revisión 27 oct)
  const step = async (name: string, run: () => Promise<number>): Promise<number> => {
    try {
      return await withTimeout(run(), bookTimeoutMs);
    } catch (e) {
      failed(report, name, e);
      return 0;
    }
  };
  report.stories = await step("cuentos", () => db.scrubStories(before, dryRun));
  // después de los libros: un email cuyo último libro acaba de caducar ya no tiene libro vigente
  report.leads = await step("leads", () => db.scrubLeads(before, dryRun));
  report.spend = await step("gasto", () => db.scrubSpend(before, dryRun));
  report.feedback = await step("notas", async () => (await db.scrubFeedback?.(before, dryRun)) ?? 0);
  // un día: el pago caduca a los 35 minutos, así que ningún pago en marcha necesita ya la dirección del borrador
  report.shipping = await step("direcciones", async () => (await db.scrubShipping?.(new Date(now.getTime() - 86_400_000), dryRun)) ?? 0);
  return report;
}

function failed(report: PurgeReport, what: string, e: unknown): void {
  report.failed++;
  if (report.errors.length < 5) report.errors.push(`${what}: ${e instanceof Error ? e.message.slice(0, 160) : "error"}`);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`sin respuesta en ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

async function purgeBook(db: PurgeDb, b: ExpiredBook, report: PurgeReport, dryRun: boolean, now: Date): Promise<void> {
  if (await db.printPending?.(b.id)) {
    report.keptForPrint++;
    return;
  }
  // ya mandado a imprimir: se guarda para poder reimprimirlo y se vuelve a mirar cuando acabe ese plazo (I29)
  const until = (await db.keepForReprint?.(b.id, now)) ?? null;
  if (until && until.getTime() > now.getTime()) {
    report.keptForReprint++;
    if (!dryRun) await db.extendBook?.(b.id, until);
    return;
  }
  const files = await db.bookFiles(b.id);
  const paid = await db.hasPaidOrder(b.id);
  report.files += files.length;
  if (paid) report.scrubbedPaid++;
  else report.deleted++;
  if (dryRun) return;
  // primero las imágenes: si falla, la fila sigue y se reintenta mañana
  if (files.length) await db.removeFiles(files);
  if (paid) await db.scrubPaidBook(b.id);
  else await db.deleteBook(b.id);
}

/**
 * Hasta cuándo se guarda una tapa dura ya mandada a la imprenta (I29): 14 días después de entregarse, para poder
 * reimprimirla, y como mucho 30 días después de mandarla. Sin fecha de salida, null.
 */
export function reprintUntil(o: { sentAt: string | null; deliveredAt: string | null }): Date | null {
  const sent = o.sentAt ? Date.parse(o.sentAt) : NaN;
  if (!Number.isFinite(sent)) return null;
  const cap = sent + KEEP_AFTER_SENT_DAYS * 86_400_000;
  const delivered = o.deliveredAt ? Date.parse(o.deliveredAt) : NaN;
  return new Date(Number.isFinite(delivered) ? Math.min(delivered + REPRINT_DAYS * 86_400_000, cap) : cap);
}

/* ------------------------------ Supabase ------------------------------ */


export function supabasePurgeDb(db: SupabaseClient<Database>, env: Record<string, string | undefined> = process.env): PurgeDb {
  const must = (error: { message: string } | null, what: string) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };
  const scrubBookFeedback = async (bookId: string) => {
    const { error } = await db.from("cuentos_feedback").update({ note: null, book_id: null, job_id: null }).eq("book_id", bookId);
    must(error, "feedback.book");
  };
  return {
    async expiredBooks(limit, after) {
      let q = db.from("cuentos_books").select("id, public_id, expires_at").lt("expires_at", new Date().toISOString()).neq("status", "expired");
      // detrás del último de la tanda anterior (misma caducidad: por id)
      // (entre comillas: la fecha lleva «.» y «:»)
      if (after) q = q.or(`expires_at.gt."${after.expiresAt}",and(expires_at.eq."${after.expiresAt}",id.gt.${after.id})`);
      const { data, error } = await q.order("expires_at").order("id").limit(limit);
      must(error, "books");
      return (data ?? []).map((b) => ({ id: b.id, publicId: b.public_id, expiresAt: b.expires_at }));
    },
    async bookFiles(bookId) {
      // con subcarpetas: Storage las lista como entradas sin id
      const out: string[] = [];
      const walk = async (folder: string, depth: number) => {
        const { data, error } = await db.storage.from(BUCKET).list(folder, { limit: 1000 });
        must(error, "storage.list");
        for (const f of data ?? []) {
          if (f.id) out.push(`${folder}/${f.name}`);
          else if (depth < 3) await walk(`${folder}/${f.name}`, depth + 1);
        }
      };
      await walk(`books/${bookId}`, 0);
      return out;
    },
    async removeFiles(paths) {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await db.storage.from(BUCKET).remove(paths.slice(i, i + 100));
        must(error, "storage.remove");
      }
    },
    async hasPaidOrder(bookId) {
      const { data, error } = await db.from("cuentos_orders").select("stripe_session_id").eq("book_id", bookId).eq("status", "paid");
      must(error, "orders");
      // en producción, solo un cobro real (como `printPending` y `keepForReprint`)
      return (data ?? []).some((o) => paidInEnv(o.stripe_session_id, env));
    },
    async printPending(bookId) {
      const { data, error } = await db
        .from("cuentos_orders")
        .select("stripe_session_id, print_status, print_error")
        .eq("book_id", bookId)
        .eq("status", "paid")
        .eq("edition", "hardcover")
        .in("print_status", ["awaiting_approval", "sending", "failed", "canceled"]);
      must(error, "orders.print");
      // en producción solo se conserva por un cobro real: las tapas duras de prueba de la preview se quedaban para
      // siempre y, con 100, atascaban el borrado (revisión 26 oct). Una parada por disputa también se conserva: si se
      // gana, vuelve a «Mandar a imprimir» y necesita sus ilustraciones (revisión 27 oct)
      return (data ?? []).some((o) => (o.print_status !== "canceled" || o.print_error === DISPUTE_HOLD) && paidInEnv(o.stripe_session_id, env));
    },
    async keepForReprint(bookId) {
      const { data, error } = await db
        .from("cuentos_orders")
        .select("stripe_session_id, print_sent_at, print_info")
        .eq("book_id", bookId)
        .eq("status", "paid")
        .eq("edition", "hardcover")
        // también lo que la imprenta devolvió o canceló: /condiciones §8 ofrece otro envío (revisión 27 oct)
        .in("print_status", ["sent", "in_production", "shipped", "delivered", "returned", "canceled"]);
      must(error, "orders.reprint");
      let until: Date | null = null;
      for (const o of data ?? []) {
        if (!paidInEnv(o.stripe_session_id, env)) continue;
        const steps = (o.print_info as { steps?: Record<string, string> } | null)?.steps ?? {};
        const u = reprintUntil({ sentAt: o.print_sent_at ?? steps.sent ?? null, deliveredAt: steps.delivered ?? null });
        if (u && (!until || u > until)) until = u;
      }
      return until;
    },
    async extendBook(bookId, until) {
      const { error } = await db.from("cuentos_books").update({ expires_at: until.toISOString() }).eq("id", bookId).lt("expires_at", until.toISOString());
      must(error, "books.extend");
    },
    async deleteBook(bookId) {
      // la nota del padre no espera a sus 30 días: se va con el libro (al borrarlo, la fila solo se desligaba)
      await scrubBookFeedback(bookId);
      const { error } = await db.from("cuentos_books").delete().eq("id", bookId);
      must(error, "books.delete");
    },
    async scrubPaidBook(bookId) {
      await scrubBookFeedback(bookId);
      const jobs = await db.from("cuentos_generation_jobs").delete().eq("book_id", bookId);
      must(jobs.error, "jobs.delete");
      const { error } = await db.from("cuentos_books").update({ draft: {}, status: "expired" }).eq("id", bookId);
      must(error, "books.scrub");
      // la dirección y el seguimiento, de todos sus pedidos: si se vacía es que ya pasó el plazo para reimprimirlo (I29),
      // y un paquete que la imprenta nunca da por entregado ya no guarda la dirección para siempre (revisión 27 oct). Lo
      // que aún no ha salido hacia la imprenta no llega aquí (`printPending`)
      const { data: orders, error: oErr } = await db.from("cuentos_orders").select("id, print_info").eq("book_id", bookId);
      must(oErr, "orders.book");
      for (const o of orders ?? []) {
        const info = o.print_info && typeof o.print_info === "object" ? { ...(o.print_info as Record<string, unknown>) } : null;
        if (info) delete info.trackingCode;
        const up = await db.from("cuentos_orders").update({ shipping: null, print_tracking_url: null, print_info: info as Json }).eq("id", o.id);
        must(up.error, "orders.shipping");
      }
    },
    async scrubStories(before, dryRun) {
      if (dryRun) {
        const { count, error } = await db.from("cuentos_stories").select("id", { count: "exact", head: true }).lt("created_at", before.toISOString());
        must(error, "stories.count");
        return count ?? 0;
      }
      const { data, error } = await db.from("cuentos_stories").delete().lt("created_at", before.toISOString()).select("id");
      must(error, "stories.delete");
      return data?.length ?? 0;
    },
    async scrubShipping(draftBefore, dryRun) {
      // 1. pedidos entregados: la dirección solo hacía falta mientras el libro viajaba
      const { data: orders, error } = await db.from("cuentos_orders").select("id, print_info").eq("print_status", "delivered").not("shipping", "is", null).limit(500);
      must(error, "orders.delivered");
      let n = orders?.length ?? 0;
      if (!dryRun) {
        for (const o of orders ?? []) {
          const info = o.print_info && typeof o.print_info === "object" ? { ...(o.print_info as Record<string, unknown>) } : null;
          if (info) delete info.trackingCode;
          const up = await db.from("cuentos_orders").update({ shipping: null, print_tracking_url: null, print_info: info as Json }).eq("id", o.id);
          must(up.error, "orders.shipping");
        }
      }
      // 2. borradores con dirección que nadie toca desde hace un día: pago abandonado, o ya copiada en el pedido
      const { data: books, error: bErr } = await db
        .from("cuentos_books")
        .select("id, draft, updated_at")
        .not("draft->shipping", "is", null)
        .lt("updated_at", draftBefore.toISOString())
        .neq("status", "expired")
        .limit(500);
      must(bErr, "books.shipping");
      n += books?.length ?? 0;
      if (!dryRun) {
        for (const b of books ?? []) {
          const draft = { ...(b.draft as Record<string, unknown>) };
          delete draft.shipping;
          // solo si nadie lo ha tocado entre medias (el padre puede estar justo editándolo)
          const up = await db.from("cuentos_books").update({ draft: draft as Json }).eq("id", b.id).eq("updated_at", b.updated_at);
          must(up.error, "books.shipping");
        }
      }
      return n;
    },
    async scrubLeads(before, dryRun) {
      // por tandas de 200 (la lista de emails va en la URL del filtro), avanzando por id: los que se quedan porque su
      // email tiene un libro vigente ya no vuelven a llenar la tanda (I11)
      let n = 0;
      let afterId = 0;
      for (let round = 0; round < 25; round++) {
        const { data: leads, error } = await db.from("cuentos_leads").select("id, email").eq("marketing", false).lt("created_at", before.toISOString()).gt("id", afterId).order("id").limit(200);
        must(error, "leads");
        if (!leads?.length) break;
        afterId = leads[leads.length - 1].id;
        const emails = [...new Set(leads.map((l) => l.email))];
        const live = await db.from("cuentos_books").select("email").in("email", emails).gt("expires_at", new Date().toISOString());
        must(live.error, "books.live");
        const keep = new Set((live.data ?? []).map((b) => b.email));
        const ids = leads.filter((l) => !keep.has(l.email)).map((l) => l.id);
        n += ids.length;
        if (!dryRun && ids.length > 0) {
          const del = await db.from("cuentos_leads").delete().in("id", ids);
          must(del.error, "leads.delete");
        }
        if (leads.length < 200) break;
      }
      return n;
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

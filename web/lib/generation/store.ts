/**
 * Almacén de libros y jobs de generación para las rutas /api/generate/* (B3) y el worker.
 *
 * - `supabaseStore(db)`: cuentos_books, cuentos_generation_jobs, cuentos_orders y el bucket privado `cuentos`.
 * - `memoryStore()`: en memoria del proceso. Solo para dry-run sin Supabase (desarrollo, tests y la preview sin
 *   service role): no sube imágenes y se pierde al reiniciar. Nunca se usa con un proveedor de pago.
 *
 * Sin `server-only` a propósito: lo importan los tests unitarios y scripts/worker.ts. Las rutas lo obtienen de
 * lib/generation/server.ts, que sí es solo servidor.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { newPublicId } from "../ids";
import { normalizeDraft } from "../story";
import type { Database, Json } from "../supabase/types";
import type { Draft } from "../types";
import type { OrderStatus, PaidEdition, PaidOrder, PrintInfo, PrintStatus, Shipping } from "../print/types";
import type { JobKind } from "./keys";
import { isLiveSession } from "../stripe";
import { normalizeEmail } from "../emailNorm";

/**
 * Qué pedidos pide un cron (revisión del 26 oct): `true`, solo cobros reales (`cs_live_…`, producción); `false`, solo los
 * demás (prueba y pago simulado, la preview); sin valor, todos. Se filtra en la consulta: filtrar después del límite
 * dejaba fuera los pedidos de un entorno cuando el otro llenaba la ventana (la base es la misma).
 */
export type LiveFilter = boolean | undefined;
const liveMatch = (live: LiveFilter, sessionId: string | null | undefined) => live === undefined || isLiveSession(sessionId) === live;
/** Como el filtro `status = 'paid'` de Supabase, en el almacén en memoria. */
const paidRow = (o: PaidOrder) => (o.status ?? "paid") === "paid";

export const BUCKET = "cuentos";

/** Libros de un buzón que mira el límite de cuentos gratis (30 días): de sobra para una persona, y los ids van en la URL. */
const FREE_BOOKS_SCAN = 100;

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface GenJob {
  id: string;
  book_id: string;
  kind: JobKind;
  page_n: number | null;
  variant: number;
  job_key: string;
  style_id: string;
  prompt: string;
  references: Json;
  status: JobStatus;
  attempts: number;
  candidates: Json;
  chosen: string | null;
  storage_path: string | null;
  cost_cents: number;
  error: string | null;
  paid: boolean;
  created_at: string;
  updated_at: string;
}

export type NewJob = Pick<GenJob, "book_id" | "kind" | "page_n" | "variant" | "job_key" | "style_id" | "prompt" | "references" | "paid">;

export interface BookRecord {
  /** cuentos_books.id (uuid) en Supabase; en memoria, el mismo public_id. */
  id: string;
  public_id: string;
  email: string | null;
  draft: Draft;
  /** El borrador tal como está guardado (el flujo nuevo guarda `{ v: 2, ficha, plan, … }`, ver lib/book). */
  raw: unknown;
  /** Cuándo caduca (cuentos_books.expires_at, 30 días desde que se creó): el borrado se lo lleva. */
  expiresAt?: string | null;
  /** cuentos_books.updated_at tal como lo da la base: `saveBookIf` guarda solo si sigue igual (I13). */
  updatedAt?: string;
  /** Cuándo se creó (solo lo traen las consultas que lo necesitan). */
  createdAt?: string | null;
}

/** Lo que mira el límite de cuentos gratis de un libro (I7). */
export interface FreeBook {
  id: string;
  publicId: string;
  createdAt: string;
  /** Cuándo pasó la puerta de los gratis; null en los libros de antes de la migración 0013. */
  freeClaimedAt: string | null;
  /** El título del cuento, para el email con los que tiene empezados. */
  title: string | null;
  /**
   * El email guardado en el libro, tal como se escribió. Su enlace va solo ahí, nunca a otro alias del mismo buzón
   * (auditoría 26 oct, menores).
   */
  email: string | null;
  /** Sus pedidos pagados (estado `paid`). */
  paid: { sessionId: string | null; createdAt: string }[];
  /** Sus hojas de personajes. */
  sheets: { status: JobStatus; updatedAt: string }[];
}

/** Libro del flujo nuevo para crear o actualizar (sin public_id se crea uno). */
export interface SaveBook {
  publicId?: string;
  email: string | null;
  draft: unknown;
  edition: string;
}

/** Guardar solo si nadie ha tocado el libro desde que se leyó (I13). */
export interface SaveBookIf {
  publicId: string;
  email: string | null;
  draft: unknown;
  edition: string;
  ifUpdatedAt: string;
}

export interface GenStore {
  mode: "supabase" | "memory";
  /** Cliente para el presupuesto (cuentos_spend); null en memoria. */
  db: SupabaseClient<Database> | null;
  /**
   * Solo por id (el enlace del libro). Nunca por email: daría el libro de otra familia (auditoría 26 oct, B5).
   * Sin `includeExpired`, un libro caducado no existe; con él, sí (solo para registrar un cobro que llega tarde).
   * Si la base falla, lanza: antes devolvía null y un cobro se daba por «libro no encontrado» (auditoría 26 oct, B7).
   */
  findBook(q: { publicId?: string; includeExpired?: boolean }): Promise<BookRecord | null>;
  /**
   * Libros de ese buzón (`email_norm`, ver normalizeEmail) creados desde `since` que han pasado la puerta de los gratis
   * (`free_claimed_at`; la migración 0013 la pone en los que ya tenían hoja), los más recientes primero, con lo justo para
   * el límite: sin el borrador (auditoría 26 oct, I7). Los intentos rechazados no entran: con cien, ya no tapaban a los
   * que cuentan (revisión 27 oct).
   */
  listFreeBooks(emailNorm: string, since: string): Promise<FreeBook[]>;
  /**
   * Marca que el libro ha pasado la puerta de los cuentos gratis (cuentos_books.free_claimed_at), o la quita con null.
   * Devuelve el updated_at nuevo de la fila.
   */
  claimFree(bookId: string, at: string | null): Promise<string | null>;
  /**
   * Bloqueo corto con caducidad (cuentos_locks): devuelve una marca si lo consigue, null si lo tiene otro. Si quien lo
   * tiene no lo suelta, a los `ms` lo puede coger otro.
   */
  lock(key: string, ms: number): Promise<string | null>;
  unlock(key: string, holder: string): Promise<void>;
  getBookById(id: string): Promise<BookRecord | null>;
  /** Solo memoria: crea o actualiza el libro con el borrador que manda el cliente (sin Supabase no hay /api/books). */
  saveMemoryBook?(b: { publicId: string; email: string | null; draft: Draft }): Promise<BookRecord>;
  listJobs(bookId: string): Promise<GenJob[]>;
  getJob(id: string): Promise<GenJob | null>;
  /** Inserta ignorando las que ya existen para (book_id, job_key): nunca hay dos jobs con la misma huella. */
  insertJobs(rows: NewJob[]): Promise<void>;
  /** Bloqueo optimista: pasa a `running` solo si nadie lo ha tocado desde que se leyó (mismo updated_at y estado). */
  claim(job: GenJob): Promise<GenJob | null>;
  updateJob(id: string, patch: Partial<Pick<GenJob, "status" | "candidates" | "chosen" | "storage_path" | "cost_cents" | "error" | "attempts">>): Promise<void>;
  /** Vuelve a `pending` un job `failed` (reintento), con el mismo bloqueo optimista. */
  reopen(job: GenJob): Promise<boolean>;
  upload(path: string, data: Uint8Array, contentType: string): Promise<void>;
  /** `download`: el nombre con el que se descarga (Content-Disposition). Sin él, sale de `signedUrls` (con su caché). */
  signedUrl(path: string, seconds: number, opts?: { download?: string }): Promise<string | null>;
  /**
   * Varias de una vez (auditoría 26 oct, I20): una sola llamada a Storage, y la misma URL mientras le quede al menos
   * `seconds` de vida, para que el móvil no vuelva a descargar la imagen en cada consulta. Las que no se puedan firmar
   * no vienen.
   */
  signedUrls(paths: string[], seconds: number): Promise<Map<string, string>>;
  /** ¿Está ese archivo en el bucket? En memoria no hay bucket: siempre false. */
  exists(path: string): Promise<boolean>;
  /** ¿Hay un pedido pagado? Con `accept`, solo cuenta si su sesión de Stripe pasa el filtro (ver `paidInEnv`). */
  hasPaidOrder(bookId: string, accept?: (sessionId: string | null) => boolean): Promise<boolean>;
  markIllustrating(bookId: string): Promise<void>;
  /** Flujo nuevo: crea o actualiza el libro con su borrador v2. */
  saveBook(b: SaveBook): Promise<BookRecord>;
  /** Como `saveBook` sobre un libro que existe, pero solo si su `updatedAt` sigue siendo `ifUpdatedAt`; si no, null. */
  saveBookIf(b: SaveBookIf): Promise<BookRecord | null>;
  /** Retrasa la caducidad del libro hasta `until` (nunca la adelanta). */
  extendBook(bookId: string, until: string): Promise<void>;
  /** Pedido pagado (pago de prueba o webhook de Stripe). La tapa dura lleva la dirección y empieza en `awaiting_approval`. */
  addPaidOrder(bookId: string, o: NewPaidOrder): Promise<void>;
  /** El pedido pagado del libro (el más reciente), con su estado en la imprenta. */
  getOrder(bookId: string): Promise<PaidOrder | null>;
  getOrderById(id: string): Promise<PaidOrder | null>;
  /** El pedido de una sesión de Stripe, en cualquier estado (devoluciones y disputas, I5). */
  getOrderBySession(sessionId: string): Promise<PaidOrder | null>;
  updateOrder(id: string, patch: OrderPatch): Promise<void>;
  /** Cambia el estado de imprenta solo si sigue en uno de `from` (dos peticiones a la vez no mandan dos pedidos). */
  claimPrint(id: string, from: PrintStatus[], to: PrintStatus): Promise<boolean>;
  /** Pedidos de tapa dura en alguno de estos estados (para el cron), los más antiguos primero. */
  listPrintOrders(statuses: PrintStatus[], limit: number, live?: LiveFilter): Promise<PaidOrder[]>;
  /** Pedidos pagados desde `since`, de cualquier edición, los más recientes primero (para el rescate, auditoría 26 oct, B4). */
  listPaidOrdersSince(since: string, limit: number, live?: LiveFilter): Promise<PaidOrder[]>;
  addFeedback(row: FeedbackRow): Promise<void>;
  listFeedback(bookId: string): Promise<FeedbackRow[]>;
}

/** Motivo de «Otra versión» o aviso de «Sigue sin estar bien» (cuentos_feedback, lib/book/feedback.ts). */
export interface FeedbackRow {
  book_id: string;
  job_id: string | null;
  kind: "redo" | "report";
  page_n: number;
  variant: number | null;
  reason: string;
  note: string | null;
  style_id: string | null;
}

export interface NewPaidOrder {
  amountCents: number;
  edition: PaidEdition | string;
  sessionId?: string | null;
  shipping?: Shipping | null;
  printStatus?: PrintStatus | null;
}

export interface OrderPatch {
  /** `refunded`: devuelto entero (I5). */
  status?: Extract<OrderStatus, "paid" | "refunded">;
  printStatus?: PrintStatus;
  printOrderId?: string | null;
  trackingUrl?: string | null;
  printError?: string | null;
  sentAt?: string | null;
  remindedAt?: string | null;
  shippedMailedAt?: string | null;
  shipping?: Shipping | null;
  info?: PrintInfo | null;
}

const ORDER_COLUMNS =
  "id, book_id, status, edition, amount_cents, stripe_session_id, shipping, print_status, print_order_id, print_tracking_url, print_error, print_sent_at, print_reminded_at, print_shipped_mailed_at, print_updated_at, print_info, created_at";

/** Aplica `LiveFilter` a una consulta de cuentos_orders (en la sintaxis de PostgREST, `*` es el comodín de like). */
function sessionFilter<Q extends { like(column: string, pattern: string): Q; or(filters: string): Q }>(q: Q, live: LiveFilter): Q {
  if (live === true) return q.like("stripe_session_id", "cs_live_*");
  if (live === false) return q.or("stripe_session_id.is.null,stripe_session_id.not.like.cs_live_*");
  return q;
}

function asOrder(r: Record<string, unknown>): PaidOrder {
  return {
    id: String(r.id),
    bookId: String(r.book_id),
    ...(typeof r.status === "string" ? { status: r.status as OrderStatus } : {}),
    edition: r.edition === "hardcover" ? "hardcover" : "illustrated",
    amountCents: Number(r.amount_cents ?? 0),
    sessionId: (r.stripe_session_id as string | null) ?? null,
    shipping: (r.shipping as Shipping | null) ?? null,
    printStatus: (r.print_status as PrintStatus | null) ?? null,
    printOrderId: (r.print_order_id as string | null) ?? null,
    trackingUrl: (r.print_tracking_url as string | null) ?? null,
    printError: (r.print_error as string | null) ?? null,
    sentAt: (r.print_sent_at as string | null) ?? null,
    remindedAt: (r.print_reminded_at as string | null) ?? null,
    shippedMailedAt: (r.print_shipped_mailed_at as string | null) ?? null,
    createdAt: String(r.created_at ?? new Date(0).toISOString()),
    updatedAt: (r.print_updated_at as string | null) ?? null,
    info: (r.print_info as PrintInfo | null) ?? null,
  };
}

function orderRow(patch: OrderPatch): Database["public"]["Tables"]["cuentos_orders"]["Update"] {
  const row: Database["public"]["Tables"]["cuentos_orders"]["Update"] = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.printStatus !== undefined) row.print_status = patch.printStatus;
  if (patch.printOrderId !== undefined) row.print_order_id = patch.printOrderId;
  if (patch.trackingUrl !== undefined) row.print_tracking_url = patch.trackingUrl;
  if (patch.printError !== undefined) row.print_error = patch.printError;
  if (patch.sentAt !== undefined) row.print_sent_at = patch.sentAt;
  if (patch.remindedAt !== undefined) row.print_reminded_at = patch.remindedAt;
  if (patch.shippedMailedAt !== undefined) row.print_shipped_mailed_at = patch.shippedMailedAt;
  if (patch.shipping !== undefined) row.shipping = patch.shipping as unknown as Json;
  if (patch.info !== undefined) row.print_info = patch.info as unknown as Json;
  // solo el estado del pago no es un cambio de imprenta
  if (Object.keys(row).some((k) => k !== "status")) row.print_updated_at = new Date().toISOString();
  return row;
}

const JOB_COLUMNS =
  "id, book_id, kind, page_n, variant, job_key, style_id, prompt, references, status, attempts, candidates, chosen, storage_path, cost_cents, error, paid, created_at, updated_at";

function asJob(row: Record<string, unknown>): GenJob {
  const status = row.status === "error" || row.status === "skipped" ? "failed" : (row.status as JobStatus);
  return { ...(row as unknown as GenJob), status, variant: Number(row.variant ?? 1), paid: !!row.paid };
}

/* ------------------------------ Supabase ------------------------------ */

/**
 * URLs firmadas por cliente (el de service role se crea una vez por instancia) y ruta (I20). Se firman por hora y media y
 * se reutilizan mientras les quede lo que se pide (la vista, una hora): la misma imagen tiene la misma URL entre
 * consultas y el navegador la tiene en caché. Ninguna URL de imagen vale más de hora y media (antes, una hora).
 */
const SIGN_S = 5400;
const signCaches = new WeakMap<object, Map<string, { url: string; exp: number }>>();

function signCache(db: object): Map<string, { url: string; exp: number }> {
  let c = signCaches.get(db);
  if (!c) signCaches.set(db, (c = new Map()));
  return c;
}

export function supabaseStore(db: SupabaseClient<Database>): GenStore {
  const jobs = () => db.from("cuentos_generation_jobs");
  const signMany = async (paths: string[], seconds: number): Promise<Map<string, string>> => {
    const cache = signCache(db);
    const now = Date.now();
    const out = new Map<string, string>();
    const missing: string[] = [];
    for (const p of new Set(paths)) {
      const c = cache.get(p);
      if (c && c.exp - now >= seconds * 1000) out.set(p, c.url);
      else missing.push(p);
    }
    if (missing.length === 0) return out;
    const { data, error } = await db.storage.from(BUCKET).createSignedUrls(missing, Math.max(SIGN_S, seconds));
    if (error) return out;
    if (cache.size > 5000) for (const [k, v] of cache) if (v.exp < now) cache.delete(k);
    if (cache.size > 5000) cache.clear();
    for (const r of data ?? []) {
      if (!r.signedUrl || r.error || !r.path) continue;
      // con margen: la vida cuenta desde que Storage firma
      cache.set(r.path, { url: r.signedUrl, exp: now + Math.max(SIGN_S, seconds) * 1000 - 10_000 });
      out.set(r.path, r.signedUrl);
    }
    return out;
  };
  const toBook = (row: { id: string; public_id: string; email: string | null; draft: Json; expires_at?: string | null; updated_at?: string | null }): BookRecord => ({
    id: row.id,
    public_id: row.public_id,
    email: row.email,
    draft: normalizeDraft(row.draft as unknown as Partial<Draft>),
    raw: row.draft,
    expiresAt: row.expires_at ?? null,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  });
  const BOOK_COLUMNS = "id, public_id, email, draft, expires_at, updated_at";
  return {
    mode: "supabase",
    db,
    async findBook({ publicId, includeExpired = false }) {
      if (!publicId) return null;
      let q = db.from("cuentos_books").select(BOOK_COLUMNS).eq("public_id", publicId);
      if (!includeExpired) q = q.gt("expires_at", new Date().toISOString());
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error(`books: ${error.message}`);
      return data ? toBook(data) : null;
    },
    async getBookById(id) {
      const { data } = await db.from("cuentos_books").select(BOOK_COLUMNS).eq("id", id).maybeSingle();
      return data ? toBook(data) : null;
    },
    async listFreeBooks(emailNorm, since) {
      // del borrador, solo el título (PostgREST lo saca en la base): nada de leer los borradores enteros (I7)
      const { data, error } = await db
        .from("cuentos_books")
        .select("id, public_id, email, created_at, free_claimed_at, title:draft->plan->>title")
        .eq("email_norm", emailNorm)
        .not("free_claimed_at", "is", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(FREE_BOOKS_SCAN);
      if (error) throw new Error(`books: ${error.message}`);
      const books = (data ?? []) as unknown as { id: string; public_id: string; email: string | null; created_at: string; free_claimed_at: string | null; title: string | null }[];
      if (books.length === 0) return [];
      const ids = books.map((b) => b.id);
      const [orders, sheets] = await Promise.all([
        db.from("cuentos_orders").select("book_id, stripe_session_id, created_at").in("book_id", ids).eq("status", "paid"),
        jobs().select("book_id, status, updated_at").in("book_id", ids).eq("kind", "sheet").not("job_key", "is", null),
      ]);
      if (orders.error) throw new Error(`orders: ${orders.error.message}`);
      if (sheets.error) throw new Error(`jobs: ${sheets.error.message}`);
      return books.map((b) => ({
        id: b.id,
        publicId: b.public_id,
        createdAt: b.created_at,
        freeClaimedAt: b.free_claimed_at ?? null,
        title: typeof b.title === "string" ? b.title : null,
        email: b.email ?? null,
        paid: (orders.data ?? []).filter((o) => o.book_id === b.id).map((o) => ({ sessionId: o.stripe_session_id ?? null, createdAt: o.created_at })),
        sheets: (sheets.data ?? []).filter((j) => j.book_id === b.id).map((j) => ({ status: asJob(j as Record<string, unknown>).status, updatedAt: j.updated_at })),
      }));
    },
    async claimFree(bookId, at) {
      const { data, error } = await db.from("cuentos_books").update({ free_claimed_at: at }).eq("id", bookId).select("updated_at").maybeSingle();
      if (error) throw new Error(`books: ${error.message}`);
      return data?.updated_at ?? null;
    },
    async lock(key, ms) {
      const holder = crypto.randomUUID();
      const now = Date.now();
      const until = new Date(now + ms).toISOString();
      // libre: la fila no existe (si existe, «ignore duplicates» no devuelve nada)
      const ins = await db.from("cuentos_locks").upsert({ key, holder, expires_at: until }, { onConflict: "key", ignoreDuplicates: true }).select("holder");
      if (ins.error) throw new Error(`locks: ${ins.error.message}`);
      if ((ins.data ?? []).some((r) => r.holder === holder)) return holder;
      // o caducado: quien lo tenía no lo soltó
      const upd = await db.from("cuentos_locks").update({ holder, expires_at: until }).eq("key", key).lt("expires_at", new Date(now).toISOString()).select("holder");
      if (upd.error) throw new Error(`locks: ${upd.error.message}`);
      return (upd.data ?? []).some((r) => r.holder === holder) ? holder : null;
    },
    async unlock(key, holder) {
      const { error } = await db.from("cuentos_locks").delete().eq("key", key).eq("holder", holder);
      if (error) throw new Error(`locks: ${error.message}`);
    },
    async listJobs(bookId) {
      const { data, error } = await jobs().select(JOB_COLUMNS).eq("book_id", bookId).not("job_key", "is", null).order("created_at", { ascending: true });
      if (error) throw new Error(`jobs: ${error.message}`);
      return (data ?? []).map((r) => asJob(r as Record<string, unknown>));
    },
    async getJob(id) {
      const { data } = await jobs().select(JOB_COLUMNS).eq("id", id).maybeSingle();
      return data ? asJob(data as Record<string, unknown>) : null;
    },
    async insertJobs(rows) {
      if (rows.length === 0) return;
      const { error } = await jobs().upsert(rows, { onConflict: "book_id,job_key", ignoreDuplicates: true });
      if (error) throw new Error(`jobs: ${error.message}`);
    },
    async claim(job) {
      const { data } = await jobs()
        .update({ status: "running", attempts: job.attempts + 1, error: null })
        .eq("id", job.id)
        .eq("status", job.status)
        .eq("updated_at", job.updated_at)
        .select(JOB_COLUMNS)
        .maybeSingle();
      return data ? asJob(data as Record<string, unknown>) : null;
    },
    async updateJob(id, patch) {
      const { error } = await jobs().update(patch).eq("id", id);
      if (error) throw new Error(`jobs: ${error.message}`);
    },
    async reopen(job) {
      const { data } = await jobs().update({ status: "pending", error: null }).eq("id", job.id).eq("updated_at", job.updated_at).select("id").maybeSingle();
      return !!data;
    },
    async upload(path, data, contentType) {
      const { error } = await db.storage.from(BUCKET).upload(path, data, { contentType, upsert: true });
      if (error) throw new Error(`storage: ${error.message}`);
    },
    async signedUrl(path, seconds, opts) {
      if (opts?.download) {
        const { data } = await db.storage.from(BUCKET).createSignedUrl(path, seconds, { download: opts.download });
        return data?.signedUrl ?? null;
      }
      return (await signMany([path], seconds)).get(path) ?? null;
    },
    signedUrls: signMany,
    async exists(path) {
      // false solo si Storage dice que no está (400/404); cualquier otro fallo lanza
      const { data } = await db.storage.from(BUCKET).exists(path);
      return data;
    },
    async hasPaidOrder(bookId, accept) {
      const { data, error } = await db.from("cuentos_orders").select("stripe_session_id").eq("book_id", bookId).eq("status", "paid");
      // si la base falla, se lanza: un «no pagado» falso registraba un cobro doble como pedido nuevo y sin aviso (revisión 26 oct)
      if (error) throw new Error(`orders: ${error.message}`);
      return (data ?? []).some((o) => !accept || accept(o.stripe_session_id));
    },
    async markIllustrating(bookId) {
      await db.from("cuentos_books").update({ status: "illustrating" }).eq("id", bookId);
    },
    async saveBook({ publicId, email, draft, edition }) {
      const json = JSON.parse(JSON.stringify(draft)) as Json;
      if (publicId) {
        const { data, error } = await db
          .from("cuentos_books")
          .update({ draft: json, edition, ...(email ? { email } : {}) })
          .eq("public_id", publicId)
          .gt("expires_at", new Date().toISOString())
          .select(BOOK_COLUMNS)
          .maybeSingle();
        if (error) throw new Error(`books: ${error.message}`);
        if (data) return toBook(data);
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await db
          .from("cuentos_books")
          .insert({ public_id: newPublicId(), draft: json, edition, email })
          .select(BOOK_COLUMNS)
          .single();
        if (!error && data) return toBook(data);
        if (error && error.code !== "23505") throw new Error(`books: ${error.message}`);
      }
      throw new Error("books: id_collision");
    },
    async saveBookIf({ publicId, email, draft, edition, ifUpdatedAt }) {
      const json = JSON.parse(JSON.stringify(draft)) as Json;
      const { data, error } = await db
        .from("cuentos_books")
        .update({ draft: json, edition, ...(email ? { email } : {}) })
        .eq("public_id", publicId)
        .eq("updated_at", ifUpdatedAt)
        .select(BOOK_COLUMNS)
        .maybeSingle();
      if (error) throw new Error(`books: ${error.message}`);
      return data ? toBook(data) : null;
    },
    async extendBook(bookId, until) {
      const { error } = await db.from("cuentos_books").update({ expires_at: until }).eq("id", bookId).lt("expires_at", until);
      if (error) throw new Error(`books: ${error.message}`);
    },
    async addPaidOrder(bookId, { amountCents, edition, sessionId, shipping, printStatus }) {
      const { error } = await db.from("cuentos_orders").insert({
        book_id: bookId,
        amount_cents: amountCents,
        edition,
        status: "paid",
        stripe_session_id: sessionId ?? null,
        ...(shipping ? { shipping: shipping as unknown as Json } : {}),
        ...(printStatus ? { print_status: printStatus, print_updated_at: new Date().toISOString() } : {}),
      });
      // la misma sesión de Stripe dos veces (reintento del webhook): ya está registrada
      if (error && error.code !== "23505") throw new Error(`orders: ${error.message}`);
    },
    async getOrder(bookId) {
      const { data, error } = await db.from("cuentos_orders").select(ORDER_COLUMNS).eq("book_id", bookId).eq("status", "paid").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`orders: ${error.message}`);
      return data ? asOrder(data as Record<string, unknown>) : null;
    },
    async getOrderById(id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      const { data, error } = await db.from("cuentos_orders").select(ORDER_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(`orders: ${error.message}`);
      return data ? asOrder(data as Record<string, unknown>) : null;
    },
    async getOrderBySession(sessionId) {
      const { data, error } = await db.from("cuentos_orders").select(ORDER_COLUMNS).eq("stripe_session_id", sessionId).maybeSingle();
      if (error) throw new Error(`orders: ${error.message}`);
      return data ? asOrder(data as Record<string, unknown>) : null;
    },
    async updateOrder(id, patch) {
      const { error } = await db.from("cuentos_orders").update(orderRow(patch)).eq("id", id);
      if (error) throw new Error(`orders: ${error.message}`);
    },
    async claimPrint(id, from, to) {
      const { data, error } = await db.from("cuentos_orders").update(orderRow({ printStatus: to })).eq("id", id).in("print_status", from).select("id").maybeSingle();
      if (error) throw new Error(`orders: ${error.message}`);
      return !!data;
    },
    async listPrintOrders(statuses, limit, live) {
      const q = db.from("cuentos_orders").select(ORDER_COLUMNS).eq("status", "paid").eq("edition", "hardcover").in("print_status", statuses);
      const { data, error } = await sessionFilter(q, live).order("created_at", { ascending: true }).limit(limit);
      if (error) throw new Error(`orders: ${error.message}`);
      return (data ?? []).map((r) => asOrder(r as Record<string, unknown>));
    },
    async listPaidOrdersSince(since, limit, live) {
      const q = db.from("cuentos_orders").select(ORDER_COLUMNS).eq("status", "paid").gte("created_at", since);
      const { data, error } = await sessionFilter(q, live).order("created_at", { ascending: false }).limit(limit);
      if (error) throw new Error(`orders: ${error.message}`);
      return (data ?? []).map((r) => asOrder(r as Record<string, unknown>));
    },
    async addFeedback(row) {
      const { error } = await db.from("cuentos_feedback").insert(row);
      if (error) throw new Error(`feedback: ${error.message}`);
    },
    async listFeedback(bookId) {
      const { data, error } = await db
        .from("cuentos_feedback")
        .select("book_id, job_id, kind, page_n, variant, reason, note, style_id")
        .eq("book_id", bookId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(`feedback: ${error.message}`);
      return (data ?? []).map((r) => ({ ...r, book_id: r.book_id ?? bookId, kind: r.kind === "report" ? "report" : "redo" }));
    },
  };
}

/* ------------------------------ memoria ------------------------------ */

interface MemoryState {
  books: Map<string, BookRecord>;
  jobs: Map<string, GenJob>;
  tick: number;
  paid?: Set<string>;
  orders?: Map<string, PaidOrder>;
  feedback?: FeedbackRow[];
  /** cuentos_books.free_claimed_at, por id de libro. */
  freeClaims?: Map<string, string>;
  /** cuentos_locks. */
  locks?: Map<string, { holder: string; until: number }>;
}

/** Como el `default` de cuentos_books.expires_at: 30 días desde que se crea el libro. */
const memoryExpiry = () => new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

/** Estado en globalThis: las rutas de Next pueden cargar el módulo más de una vez en el mismo proceso. */
function memoryState(): MemoryState {
  const g = globalThis as unknown as { __cuentosGen?: MemoryState };
  g.__cuentosGen ??= { books: new Map(), jobs: new Map(), tick: 0 };
  return g.__cuentosGen;
}

export function memoryStore(state: MemoryState = memoryState()): GenStore {
  // marca de tiempo estrictamente creciente: el bloqueo optimista compara updated_at
  const stamp = () => new Date(Date.now() + ++state.tick).toISOString();
  const clone = (j: GenJob): GenJob => JSON.parse(JSON.stringify(j));
  return {
    mode: "memory",
    db: null,
    async findBook({ publicId, includeExpired = false }) {
      const b = publicId ? state.books.get(publicId) : undefined;
      if (!b) return null;
      // como en Supabase: un libro caducado no existe, salvo para registrar un cobro
      if (!includeExpired && b.expiresAt && b.expiresAt <= new Date().toISOString()) return null;
      return b;
    },
    async getBookById(id) {
      return state.books.get(id) ?? null;
    },
    async listFreeBooks(emailNorm, since) {
      const created = (b: BookRecord) => b.createdAt ?? (b.expiresAt ? new Date(Date.parse(b.expiresAt) - 30 * 24 * 3600 * 1000).toISOString() : new Date().toISOString());
      const title = (b: BookRecord) => {
        const t = (b.raw as { plan?: { title?: unknown } } | null)?.plan?.title;
        return typeof t === "string" ? t : null;
      };
      // como la base: los que pasaron la puerta, y los de antes que ya tenían hoja (lo que rellena la migración 0013)
      const passed = (b: BookRecord) => state.freeClaims?.has(b.id) || [...state.jobs.values()].some((j) => j.book_id === b.id && j.kind === "sheet");
      return [...state.books.values()]
        .filter((b) => !!b.email && normalizeEmail(b.email) === emailNorm && created(b) >= since && passed(b))
        .sort((a, b) => created(b).localeCompare(created(a)))
        .slice(0, FREE_BOOKS_SCAN)
        .map((b) => ({
          id: b.id,
          publicId: b.public_id,
          createdAt: created(b),
          freeClaimedAt: state.freeClaims?.get(b.id) ?? null,
          title: title(b),
          email: b.email,
          paid: [...(state.orders?.values() ?? [])].filter((o) => o.bookId === b.id && paidRow(o)).map((o) => ({ sessionId: o.sessionId ?? null, createdAt: o.createdAt })),
          sheets: [...state.jobs.values()].filter((j) => j.book_id === b.id && j.kind === "sheet").map((j) => ({ status: j.status, updatedAt: j.updated_at })),
        }));
    },
    async claimFree(bookId, at) {
      // con el reloj del almacén, como el updated_at de los jobs (en Supabase, la hora del servidor contra now() de la base)
      if (at) (state.freeClaims ??= new Map()).set(bookId, stamp());
      else state.freeClaims?.delete(bookId);
      const b = state.books.get(bookId);
      if (!b) return null;
      b.updatedAt = stamp();
      return b.updatedAt;
    },
    async lock(key, ms) {
      const locks = (state.locks ??= new Map());
      const cur = locks.get(key);
      if (cur && cur.until > Date.now()) return null;
      const holder = crypto.randomUUID();
      locks.set(key, { holder, until: Date.now() + ms });
      return holder;
    },
    async unlock(key, holder) {
      if (state.locks?.get(key)?.holder === holder) state.locks.delete(key);
    },
    async saveMemoryBook({ publicId, email, draft }) {
      const prev = state.books.get(publicId);
      const book: BookRecord = { id: publicId, public_id: publicId, email: email ?? prev?.email ?? null, draft, raw: draft, expiresAt: prev?.expiresAt ?? memoryExpiry() };
      state.books.set(publicId, book);
      return book;
    },
    async extendBook(bookId, until) {
      const b = state.books.get(bookId);
      if (b && (!b.expiresAt || b.expiresAt < until)) b.expiresAt = until;
    },
    async saveBook({ publicId, email, draft }) {
      const id = publicId && state.books.has(publicId) ? publicId : newPublicId();
      const prev = state.books.get(id);
      const book: BookRecord = { id, public_id: id, email: email ?? prev?.email ?? null, draft: normalizeDraft({}), raw: JSON.parse(JSON.stringify(draft)), expiresAt: prev?.expiresAt ?? memoryExpiry(), updatedAt: stamp(), createdAt: prev?.createdAt ?? new Date().toISOString() };
      state.books.set(id, book);
      return book;
    },
    async saveBookIf({ publicId, email, draft, ifUpdatedAt }) {
      const prev = state.books.get(publicId);
      if (!prev || prev.updatedAt !== ifUpdatedAt) return null;
      const book: BookRecord = { ...prev, email: email ?? prev.email, raw: JSON.parse(JSON.stringify(draft)), updatedAt: stamp() };
      state.books.set(publicId, book);
      return book;
    },
    async addPaidOrder(bookId, o) {
      (state.paid ??= new Set()).add(bookId);
      const orders = (state.orders ??= new Map());
      // como el `unique` de stripe_session_id; sin sesión, un pedido por edición (la mejora a tapa dura es un segundo pedido)
      if ([...orders.values()].some((x) => (o.sessionId ? x.sessionId === o.sessionId : x.bookId === bookId && x.edition === o.edition))) return;
      const id = crypto.randomUUID();
      orders.set(id, {
        id,
        bookId,
        status: "paid",
        edition: o.edition === "hardcover" ? "hardcover" : "illustrated",
        amountCents: o.amountCents,
        sessionId: o.sessionId ?? null,
        shipping: o.shipping ?? null,
        printStatus: o.printStatus ?? null,
        printOrderId: null,
        trackingUrl: null,
        printError: null,
        sentAt: null,
        remindedAt: null,
        shippedMailedAt: null,
        createdAt: stamp(),
        updatedAt: null,
        info: null,
      });
    },
    async getOrder(bookId) {
      const o = [...(state.orders?.values() ?? [])].reverse().find((x) => x.bookId === bookId && paidRow(x));
      return o ? { ...o } : null;
    },
    async getOrderById(id) {
      const o = state.orders?.get(id);
      return o ? { ...o } : null;
    },
    async getOrderBySession(sessionId) {
      const o = [...(state.orders?.values() ?? [])].find((x) => x.sessionId === sessionId);
      return o ? { ...o } : null;
    },
    async updateOrder(id, patch) {
      const o = state.orders?.get(id);
      if (!o) return;
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) (o as unknown as Record<string, unknown>)[k] = v;
      o.updatedAt = stamp();
    },
    async claimPrint(id, from, to) {
      const o = state.orders?.get(id);
      if (!o || !o.printStatus || !from.includes(o.printStatus)) return false;
      o.printStatus = to;
      o.updatedAt = stamp();
      return true;
    },
    async listPrintOrders(statuses, limit, live) {
      return [...(state.orders?.values() ?? [])]
        .filter((o) => paidRow(o) && o.edition === "hardcover" && o.printStatus && statuses.includes(o.printStatus) && liveMatch(live, o.sessionId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit)
        .map((o) => ({ ...o }));
    },
    async listPaidOrdersSince(since, limit, live) {
      return [...(state.orders?.values() ?? [])]
        .filter((o) => paidRow(o) && o.createdAt >= since && liveMatch(live, o.sessionId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((o) => ({ ...o }));
    },
    async addFeedback(row) {
      (state.feedback ??= []).push({ ...row });
    },
    async listFeedback(bookId) {
      return (state.feedback ?? []).filter((f) => f.book_id === bookId).map((f) => ({ ...f }));
    },
    async listJobs(bookId) {
      return [...state.jobs.values()].filter((j) => j.book_id === bookId).map(clone);
    },
    async getJob(id) {
      const j = state.jobs.get(id);
      return j ? clone(j) : null;
    },
    async insertJobs(rows) {
      for (const r of rows) {
        const exists = [...state.jobs.values()].some((j) => j.book_id === r.book_id && j.job_key === r.job_key);
        if (exists) continue;
        const now = stamp();
        const job: GenJob = {
          ...r,
          id: crypto.randomUUID(),
          status: "pending",
          attempts: 0,
          candidates: [],
          chosen: null,
          storage_path: null,
          cost_cents: 0,
          error: null,
          created_at: now,
          updated_at: now,
        };
        state.jobs.set(job.id, job);
      }
    },
    async claim(job) {
      const cur = state.jobs.get(job.id);
      if (!cur || cur.status !== job.status || cur.updated_at !== job.updated_at) return null;
      Object.assign(cur, { status: "running", attempts: job.attempts + 1, error: null, updated_at: stamp() });
      return clone(cur);
    },
    async updateJob(id, patch) {
      const cur = state.jobs.get(id);
      if (cur) Object.assign(cur, patch, { updated_at: stamp() });
    },
    async reopen(job) {
      const cur = state.jobs.get(job.id);
      if (!cur || cur.updated_at !== job.updated_at) return false;
      Object.assign(cur, { status: "pending", error: null, updated_at: stamp() });
      return true;
    },
    async upload() {
      throw new Error("sin Storage: el almacén en memoria solo admite dry-run");
    },
    async signedUrl() {
      return null;
    },
    async exists() {
      return false;
    },
    // sin Storage no hay nada que firmar; de una en una con `signedUrl`, por si un test la sustituye
    async signedUrls(paths, seconds) {
      const out = new Map<string, string>();
      for (const p of paths) {
        const url = await this.signedUrl(p, seconds);
        if (url) out.set(p, url);
      }
      return out;
    },
    async hasPaidOrder(bookId, accept) {
      const mine = [...(state.orders?.values() ?? [])].filter((o) => o.bookId === bookId);
      if (!accept) return !!state.paid?.has(bookId) && (mine.length === 0 || mine.some(paidRow));
      return mine.some((o) => paidRow(o) && accept(o.sessionId ?? null));
    },
    async markIllustrating() {},
  };
}

/** Estado vacío (tests). */
export function newMemoryState(): MemoryState {
  return { books: new Map(), jobs: new Map(), tick: 0 };
}

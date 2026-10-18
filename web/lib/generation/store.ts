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
import type { PaidEdition, PaidOrder, PrintStatus, Shipping } from "../print/types";
import type { JobKind } from "./keys";

export const BUCKET = "cuentos";

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
}

/** Libro del flujo nuevo para crear o actualizar (sin public_id se crea uno). */
export interface SaveBook {
  publicId?: string;
  email: string | null;
  draft: unknown;
  edition: string;
}

export interface GenStore {
  mode: "supabase" | "memory";
  /** Cliente para el presupuesto (cuentos_spend); null en memoria. */
  db: SupabaseClient<Database> | null;
  findBook(q: { publicId?: string; email?: string }): Promise<BookRecord | null>;
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
  signedUrl(path: string, seconds: number): Promise<string | null>;
  hasPaidOrder(bookId: string): Promise<boolean>;
  markIllustrating(bookId: string): Promise<void>;
  /** Flujo nuevo: crea o actualiza el libro con su borrador v2. */
  saveBook(b: SaveBook): Promise<BookRecord>;
  /** Pedido pagado (pago de prueba o webhook de Stripe). La tapa dura lleva la dirección y empieza en `awaiting_approval`. */
  addPaidOrder(bookId: string, o: NewPaidOrder): Promise<void>;
  /** El pedido pagado del libro (el más reciente), con su estado en la imprenta. */
  getOrder(bookId: string): Promise<PaidOrder | null>;
  getOrderById(id: string): Promise<PaidOrder | null>;
  updateOrder(id: string, patch: OrderPatch): Promise<void>;
  /** Cambia el estado de imprenta solo si sigue en uno de `from` (dos peticiones a la vez no mandan dos pedidos). */
  claimPrint(id: string, from: PrintStatus[], to: PrintStatus): Promise<boolean>;
  /** Pedidos de tapa dura en alguno de estos estados (para el cron), los más antiguos primero. */
  listPrintOrders(statuses: PrintStatus[], limit: number): Promise<PaidOrder[]>;
}

export interface NewPaidOrder {
  amountCents: number;
  edition: PaidEdition | string;
  sessionId?: string | null;
  shipping?: Shipping | null;
  printStatus?: PrintStatus | null;
}

export interface OrderPatch {
  printStatus?: PrintStatus;
  printOrderId?: string | null;
  trackingUrl?: string | null;
  printError?: string | null;
  sentAt?: string | null;
  remindedAt?: string | null;
  shippedMailedAt?: string | null;
  shipping?: Shipping | null;
}

const ORDER_COLUMNS =
  "id, book_id, edition, amount_cents, stripe_session_id, shipping, print_status, print_order_id, print_tracking_url, print_error, print_sent_at, print_reminded_at, print_shipped_mailed_at, print_updated_at, created_at";

function asOrder(r: Record<string, unknown>): PaidOrder {
  return {
    id: String(r.id),
    bookId: String(r.book_id),
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
  };
}

function orderRow(patch: OrderPatch): Database["public"]["Tables"]["cuentos_orders"]["Update"] {
  const row: Database["public"]["Tables"]["cuentos_orders"]["Update"] = {};
  if (patch.printStatus !== undefined) row.print_status = patch.printStatus;
  if (patch.printOrderId !== undefined) row.print_order_id = patch.printOrderId;
  if (patch.trackingUrl !== undefined) row.print_tracking_url = patch.trackingUrl;
  if (patch.printError !== undefined) row.print_error = patch.printError;
  if (patch.sentAt !== undefined) row.print_sent_at = patch.sentAt;
  if (patch.remindedAt !== undefined) row.print_reminded_at = patch.remindedAt;
  if (patch.shippedMailedAt !== undefined) row.print_shipped_mailed_at = patch.shippedMailedAt;
  if (patch.shipping !== undefined) row.shipping = patch.shipping as unknown as Json;
  row.print_updated_at = new Date().toISOString();
  return row;
}

const JOB_COLUMNS =
  "id, book_id, kind, page_n, variant, job_key, style_id, prompt, references, status, attempts, candidates, chosen, storage_path, cost_cents, error, paid, created_at, updated_at";

function asJob(row: Record<string, unknown>): GenJob {
  const status = row.status === "error" || row.status === "skipped" ? "failed" : (row.status as JobStatus);
  return { ...(row as unknown as GenJob), status, variant: Number(row.variant ?? 1), paid: !!row.paid };
}

/* ------------------------------ Supabase ------------------------------ */

export function supabaseStore(db: SupabaseClient<Database>): GenStore {
  const jobs = () => db.from("cuentos_generation_jobs");
  const toBook = (row: { id: string; public_id: string; email: string | null; draft: Json }): BookRecord => ({
    id: row.id,
    public_id: row.public_id,
    email: row.email,
    draft: normalizeDraft(row.draft as unknown as Partial<Draft>),
    raw: row.draft,
  });
  return {
    mode: "supabase",
    db,
    async findBook({ publicId, email }) {
      const now = new Date().toISOString();
      if (publicId) {
        const { data } = await db.from("cuentos_books").select("id, public_id, email, draft").eq("public_id", publicId).gt("expires_at", now).maybeSingle();
        return data ? toBook(data) : null;
      }
      if (email) {
        const { data } = await db
          .from("cuentos_books")
          .select("id, public_id, email, draft")
          .eq("email", email)
          .gt("expires_at", now)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        return data ? toBook(data) : null;
      }
      return null;
    },
    async getBookById(id) {
      const { data } = await db.from("cuentos_books").select("id, public_id, email, draft").eq("id", id).maybeSingle();
      return data ? toBook(data) : null;
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
    async signedUrl(path, seconds) {
      const { data } = await db.storage.from(BUCKET).createSignedUrl(path, seconds);
      return data?.signedUrl ?? null;
    },
    async hasPaidOrder(bookId) {
      const { data } = await db.from("cuentos_orders").select("id").eq("book_id", bookId).eq("status", "paid").limit(1);
      return !!data && data.length > 0;
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
          .select("id, public_id, email, draft")
          .maybeSingle();
        if (error) throw new Error(`books: ${error.message}`);
        if (data) return toBook(data);
      }
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await db
          .from("cuentos_books")
          .insert({ public_id: newPublicId(), draft: json, edition, email })
          .select("id, public_id, email, draft")
          .single();
        if (!error && data) return toBook(data);
        if (error && error.code !== "23505") throw new Error(`books: ${error.message}`);
      }
      throw new Error("books: id_collision");
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
    async updateOrder(id, patch) {
      const { error } = await db.from("cuentos_orders").update(orderRow(patch)).eq("id", id);
      if (error) throw new Error(`orders: ${error.message}`);
    },
    async claimPrint(id, from, to) {
      const { data, error } = await db.from("cuentos_orders").update(orderRow({ printStatus: to })).eq("id", id).in("print_status", from).select("id").maybeSingle();
      if (error) throw new Error(`orders: ${error.message}`);
      return !!data;
    },
    async listPrintOrders(statuses, limit) {
      const { data, error } = await db.from("cuentos_orders").select(ORDER_COLUMNS).eq("status", "paid").eq("edition", "hardcover").in("print_status", statuses).order("created_at", { ascending: true }).limit(limit);
      if (error) throw new Error(`orders: ${error.message}`);
      return (data ?? []).map((r) => asOrder(r as Record<string, unknown>));
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
}

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
    async findBook({ publicId, email }) {
      if (publicId) return state.books.get(publicId) ?? null;
      if (email) return [...state.books.values()].reverse().find((b) => b.email === email) ?? null;
      return null;
    },
    async getBookById(id) {
      return state.books.get(id) ?? null;
    },
    async saveMemoryBook({ publicId, email, draft }) {
      const prev = state.books.get(publicId);
      const book: BookRecord = { id: publicId, public_id: publicId, email: email ?? prev?.email ?? null, draft, raw: draft };
      state.books.set(publicId, book);
      return book;
    },
    async saveBook({ publicId, email, draft }) {
      const id = publicId && state.books.has(publicId) ? publicId : newPublicId();
      const prev = state.books.get(id);
      const book: BookRecord = { id, public_id: id, email: email ?? prev?.email ?? null, draft: normalizeDraft({}), raw: JSON.parse(JSON.stringify(draft)) };
      state.books.set(id, book);
      return book;
    },
    async addPaidOrder(bookId, o) {
      (state.paid ??= new Set()).add(bookId);
      const orders = (state.orders ??= new Map());
      if ([...orders.values()].some((x) => x.bookId === bookId)) return;
      const id = crypto.randomUUID();
      orders.set(id, {
        id,
        bookId,
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
      });
    },
    async getOrder(bookId) {
      const o = [...(state.orders?.values() ?? [])].reverse().find((x) => x.bookId === bookId);
      return o ? { ...o } : null;
    },
    async getOrderById(id) {
      const o = state.orders?.get(id);
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
    async listPrintOrders(statuses, limit) {
      return [...(state.orders?.values() ?? [])].filter((o) => o.edition === "hardcover" && o.printStatus && statuses.includes(o.printStatus)).slice(0, limit).map((o) => ({ ...o }));
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
    async hasPaidOrder(bookId) {
      return !!state.paid?.has(bookId);
    },
    async markIllustrating() {},
  };
}

/** Estado vacío (tests). */
export function newMemoryState(): MemoryState {
  return { books: new Map(), jobs: new Map(), tick: 0 };
}

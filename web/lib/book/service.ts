/**
 * Libro del flujo nuevo (B3–B4): de la ficha y el plan aprobados a la hoja de reparto, la portada y las 12 páginas.
 * Reutiliza el almacén, el presupuesto y la ejecución de jobs de lib/generation (runJob con la marca `v2`).
 *
 * Borrador guardado en cuentos_books.draft:
 *   { v: 2, ficha, plan, planMeta, castArt?, pagesArt?, approvedSheetJobId?, updatedAt }
 *
 * Gasto (D2): antes del pago, hoja 1K (4 c) + portada 2K (6 c) y hasta 2 cambios de hoja con su portada = 30 c.
 * Tras el pago: 12 páginas 2K y una versión más por página (tope por libro MAX_COST_CENTS_PER_BOOK).
 */
import { selectLlm, type Llm } from "../llm";
import { hashString } from "../story/hash";
import { getStyle } from "../generation/styles";
import { MAX_ATTEMPTS, gateSpend, v2Of, type Fail, type V2Spec } from "../generation/service";
import { jobKey } from "../generation/keys";
import type { BookRecord, GenJob, GenStore, NewJob } from "../generation/store";
import { estimatedCostCents, type GenerationAdapter } from "../generation/adapter";
import { canSpend, freeBookCapCents } from "../generation/budget";
import { FREE_BOOKS, freeUse } from "./freeLimit";
import { castArt, castArtKey, coverPrompt, pageArtKey, pagePrompt, pagesArt, pagesArtKey, portraitPrompt, redoScene, reviseCast, sheetPrompt, type CastArt, type PageFix, type PagesArt } from "../plan/art";
import { MAX_BOOK_REDOS, MAX_PAGE_REDOS, REDO_FIX_EN, REDO_REASONS, cleanNote, isRedoReason, type RedoReason } from "./feedback";
import { fichaHash, normalizeFicha } from "../plan/ficha";
import { blockedWord, contactData } from "../plan/moderation";
import { planFromClient } from "../plan/planner";
import { validatePlan } from "../plan/validate";
import type { Ficha, Plan } from "../plan/types";
import { cleanShipping } from "../print/shipping";
import { PRICE_CENTS as PRICES, paidEdition, upgradeCents, upgradeDeadline } from "../print/prices";
import { LOCKED_PRINT_STATUSES, type PaidEdition, type PaidOrder, type PrintView, type Shipping } from "../print/types";
import { paidInEnv, printableInEnv } from "../stripe";

type Env = Record<string, string | undefined>;

/** ¿El libro está pagado en este entorno? En producción solo cuentan los cobros reales (`paidInEnv`, auditoría 26 oct). */
function paidHere(store: GenStore, bookUuid: string, env: Env): Promise<boolean> {
  return store.hasPaidOrder(bookUuid, (s) => paidInEnv(s, env));
}

/** Pagada la tapa dura (también la mejora), el libro se guarda al menos este tiempo para poder mandarlo a imprimir. */
/** Un libro pagado se guarda 30 días desde el pago (no desde que se empezó): auditoría 26 oct, B3. */
const KEEP_AFTER_PAYMENT_MS = 30 * 24 * 3600 * 1000;

export const MAX_SHEETS = 3; // la primera + 2 cambios con palabras
/**
 * Lo que admite la base (cuentos_generation_jobs_variant_check): 1..4 desde docs/sql/cuentos_8_variant_hasta_4.sql
 * (aplicada el 25 oct). Si se cambia, cambiar las dos cosas a la vez: sin este tope, una versión de más fallaba al
 * guardarse (500) en vez de decir que no hay más.
 */
export const DB_MAX_VARIANT = 4;
// la incluida + 2 versiones con motivo + 1 por si el padre cambia la escena, sin pasar de lo que admite la base
export const MAX_PAGE_JOBS = Math.min(1 + MAX_PAGE_REDOS + 1, DB_MAX_VARIANT);
/** Precio del PDF ilustrado (el de la tapa dura, en lib/print/prices.ts). */
export const PRICE_CENTS = PRICES.illustrated;

export interface BookDraftV2 {
  v: 2;
  ficha: Ficha;
  plan: Plan;
  planMeta: { provider: string; model: string; fichaHash: string };
  castArt?: CastArt;
  pagesArt?: PagesArt;
  approvedSheetJobId?: string;
  /** Versión elegida de cada página (id del job); sin elegir, la última pintada de la escena actual. */
  pageChoice?: Record<number, string>;
  /** Email de «tu libro está listo» enviado (una vez). */
  readyMailedAt?: number;
  /** Edición elegida al abrir el pago y dirección de envío de la tapa dura (pasan al pedido cuando llega el pago). */
  edition?: PaidEdition;
  shipping?: Shipping;
  updatedAt: number;
}

function fail(status: number, error: string, message?: string): Fail {
  return { ok: false, status, error, ...(message ? { reason: message } : {}) };
}
const isFail = (v: unknown): v is Fail => !!v && typeof v === "object" && (v as Fail).ok === false;

export function draftV2(book: BookRecord): BookDraftV2 | null {
  const raw = book.raw as Partial<BookDraftV2> | null;
  if (!raw || raw.v !== 2 || !raw.ficha || !raw.plan) return null;
  const ficha = normalizeFicha(raw.ficha);
  const plan = planFromClient(ficha, raw.plan);
  if (!plan) return null;
  return { ...(raw as BookDraftV2), ficha, plan };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return EMAIL_RE.test(e) && e.length <= 200 ? e : null;
}

const spec = (aspect: V2Spec["aspect"], size: V2Spec["size"]): V2Spec => ({ kind: "v2", aspect, size });

function sheetJobs(jobs: GenJob[]): GenJob[] {
  return jobs.filter((j) => j.kind === "sheet" && v2Of(j)).sort((a, b) => a.variant - b.variant);
}
function coverJobs(jobs: GenJob[]): GenJob[] {
  return jobs.filter((j) => j.kind === "cover" && v2Of(j)).sort((a, b) => a.variant - b.variant);
}
function sheetRefOf(job: GenJob): string | null {
  const refs = Array.isArray(job.references) ? (job.references as { kind?: string; job_id?: string }[]) : [];
  return refs.find((r) => r?.kind === "sheet")?.job_id ?? null;
}

/** Hoja y portada que van juntas (misma versión del reparto). */
function sheetAndCover(book: BookRecord, d: BookDraftV2, variant: number): NewJob[] {
  const style = getStyle(d.ficha.styleId)!;
  const art = d.castArt!;
  const sp = sheetPrompt(art, style);
  return [
    {
      book_id: book.id,
      kind: "sheet",
      page_n: null,
      variant,
      job_key: jobKey("sheet", 0, variant, hashString(sp)),
      style_id: style.id,
      prompt: sp,
      references: [{ kind: "anchor", style_id: style.id }, spec("3:2", "1K")] as unknown as NewJob["references"],
      paid: false,
    },
  ];
}

function coverRow(book: BookRecord, d: BookDraftV2, variant: number, sheetJobId: string): NewJob {
  const style = getStyle(d.ficha.styleId)!;
  const cp = coverPrompt(d.castArt!, style);
  return {
    book_id: book.id,
    kind: "cover",
    page_n: null,
    variant,
    job_key: jobKey("cover", 0, variant, hashString(`${cp}|${sheetJobId}`)),
    style_id: style.id,
    prompt: cp,
    references: [{ kind: "sheet", job_id: sheetJobId }, { kind: "anchor", style_id: style.id }, spec("3:2", "2K")] as unknown as NewJob["references"],
    paid: false,
  };
}

async function save(store: GenStore, book: BookRecord, d: BookDraftV2, edition = "illustrated"): Promise<BookRecord> {
  return store.saveBook({ publicId: book.public_id, email: book.email, draft: { ...d, updatedAt: Date.now() }, edition });
}

export async function loadBook(store: GenStore, bookId: unknown, { includeExpired = false }: { includeExpired?: boolean } = {}): Promise<{ book: BookRecord; d: BookDraftV2 } | Fail> {
  const id = typeof bookId === "string" && /^[a-z0-9]{8,16}$/.test(bookId) ? bookId : null;
  if (!id) return fail(400, "book_id");
  const book = await store.findBook({ publicId: id, includeExpired });
  if (!book) return fail(404, "not_found");
  const d = draftV2(book);
  if (!d) return fail(409, "not_v2");
  return { book, d };
}

/* ------------------------------ paso 4: hoja + portada ------------------------------ */

export interface StartInput {
  bookId?: unknown;
  email?: unknown;
  ficha?: unknown;
  plan?: unknown;
  planMeta?: unknown;
}

export interface StartResult {
  ok: true;
  bookId: string;
  sheetJobId: string;
  coverJobId: string;
  created: number;
  /** Jobs fallidos que se han vuelto a poner en cola (un intento más). */
  reopened?: number;
  /** Primera hoja de este libro: se manda el email con el enlace para volver. */
  fresh?: boolean;
  /** Cuentos con dibujos gratis que le quedan a este buzón después de este (0 = este es el último del periodo). */
  freeLeft?: number;
  email?: string;
  title?: string;
}

/** El buzón ya tiene sus cuentos gratis del periodo: no se dibuja; la ruta le manda por email los que tiene empezados. */
export interface FreeLimitFail extends Fail {
  error: "free_limit";
  books: { publicId: string; title: string }[];
}

/** Guarda ficha + plan con el email, prepara la dirección de arte del reparto y encola hoja + portada (una vez). */
export async function startBook(store: GenStore, input: StartInput, adapter: Pick<GenerationAdapter, "name">, llm: Llm = selectLlm("art")): Promise<StartResult | Fail> {
  const email = cleanEmail(input.email);
  if (!email) return fail(400, "email");
  const ficha = normalizeFicha(input.ficha);
  if (!ficha.hero.name) return fail(400, "ficha");
  const plan = planFromClient(ficha, input.plan);
  if (!plan) return fail(400, "plan");
  const v = validatePlan(plan, ficha);
  if (!v.usable) return fail(422, "plan_invalid", v.issues.filter((i) => i.hard).map((i) => i.msg).slice(0, 3).join(" "));
  if (!getStyle(ficha.styleId)) return fail(400, "style_id");
  const meta = (input.planMeta && typeof input.planMeta === "object" ? input.planMeta : {}) as Record<string, unknown>;

  let book: BookRecord | null = null;
  let prev: BookDraftV2 | null = null;
  if (typeof input.bookId === "string" && /^[a-z0-9]{8,16}$/.test(input.bookId)) {
    book = await store.findBook({ publicId: input.bookId });
    prev = book ? draftV2(book) : null;
    if (book && book.email && book.email !== email) book = null; // otro email: libro nuevo
  }
  const d: BookDraftV2 = {
    v: 2,
    ficha,
    plan,
    planMeta: { provider: String(meta.provider ?? "desconocido").slice(0, 40), model: String(meta.model ?? "").slice(0, 60), fichaHash: fichaHash(ficha) },
    castArt: prev?.castArt,
    pagesArt: prev?.pagesArt,
    approvedSheetJobId: prev?.approvedSheetJobId,
    readyMailedAt: prev?.readyMailedAt,
    edition: prev?.edition,
    shipping: prev?.shipping,
    updatedAt: Date.now(),
  };
  book = await store.saveBook({ publicId: book?.public_id, email, draft: d, edition: "illustrated" });

  const existing = await store.listJobs(book.id);
  const key = castArtKey(ficha, plan);
  const sheets = sheetJobs(existing);
  const current = d.castArt?.key === key ? sheets.filter((j) => j.prompt === sheetPrompt(d.castArt!, getStyle(ficha.styleId)!)) : [];

  // ya hay hoja para este reparto: no se gasta otra vez (si falló y le queda un intento, se reabre)
  if (current.length > 0) {
    const sheet = current[current.length - 1];
    const cover = coverJobs(existing).find((c) => sheetRefOf(c) === sheet.id);
    if (cover) {
      let reopened = 0;
      for (const j of [sheet, cover]) if (j.status === "failed" && j.attempts < MAX_ATTEMPTS && (await store.reopen(j))) reopened++;
      return { ok: true, bookId: book.public_id, sheetJobId: sheet.id, coverJobId: cover.id, created: 0, reopened };
    }
  }
  if (sheets.length >= MAX_SHEETS) return fail(409, "max_versions", "Ya has usado las versiones de la hoja de este libro.");

  // la puerta (26 oct): cuántos cuentos con dibujos lleva este buzón sin pagar. Se mira antes de dibujar el primero:
  // un cuento que empieza siempre termina
  let freeLeft: number | undefined;
  if (sheets.length === 0) {
    const use = await freeUse(store, email, { exceptBookId: book.id });
    if (use.used >= FREE_BOOKS) return { ok: false, status: 429, error: "free_limit", books: use.books.map((b) => ({ publicId: b.public_id, title: draftV2(b)?.plan.title ?? "Tu cuento" })) } as FreeLimitFail;
    freeLeft = use.left;
  }

  // hoja + portada tienen que caber en el presupuesto del libro y en el del día
  const both = await gateSpendCents(store, book.id, sheetAndCoverCents(adapter.name));
  if (!both.ok) return fail(402, "budget", both.reason);

  if (d.castArt?.key !== key) {
    const r = await castArt(ficha, plan, llm);
    d.castArt = r.art;
    d.pagesArt = undefined;
    book = await save(store, book, d);
  }

  const variant = sheets.length + 1;
  await store.insertJobs(sheetAndCover(book, d, variant));
  const sheet = sheetJobs(await store.listJobs(book.id)).find((j) => j.variant === variant);
  if (!sheet) return fail(500, "db");
  await store.insertJobs([coverRow(book, d, variant, sheet.id)]);
  const cover = coverJobs(await store.listJobs(book.id)).find((c) => sheetRefOf(c) === sheet.id);
  if (!cover) return fail(500, "db");
  return { ok: true, bookId: book.public_id, sheetJobId: sheet.id, coverJobId: cover.id, created: 2, fresh: variant === 1, email, title: plan.title, freeLeft };
}

/** Comprueba que `cents` caben en el presupuesto del libro (antes del pago) y en el del día. */
async function gateSpendCents(store: GenStore, bookId: string, cents: number): Promise<{ ok: boolean; reason?: string }> {
  if (cents <= 0) return { ok: true };
  return canSpend(store.db, { leadId: bookId, cents, leadCap: freeBookCapCents() });
}

function sheetAndCoverCents(provider: string): number {
  return estimatedCostCents(provider, "1K") + estimatedCostCents(provider, "2K");
}

/* ------------------------------ cambiar la hoja con palabras ------------------------------ */

export async function reviseSheet(store: GenStore, input: { bookId?: unknown; instruction?: unknown }, adapter: Pick<GenerationAdapter, "name">, llm: Llm = selectLlm("art")): Promise<StartResult | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  let { book } = loaded;
  const { d } = loaded;
  const instruction = typeof input.instruction === "string" ? input.instruction.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  if (!instruction) return fail(400, "instruction");
  const bad = blockedWord(instruction) ?? contactData(instruction);
  if (bad) return fail(422, "moderation", `Eso no lo podemos poner en un cuento infantil («${bad}»).`);
  if (!d.castArt || !book.email) return fail(409, "no_sheet");
  const existing = await store.listJobs(book.id);
  const sheets = sheetJobs(existing);
  if (sheets.length === 0) return fail(409, "no_sheet");
  if (sheets.length >= MAX_SHEETS) return fail(409, "max_versions", "Ya has usado los dos cambios de la hoja.");
  const both = await gateSpendCents(store, book.id, sheetAndCoverCents(adapter.name));
  if (!both.ok) return fail(402, "budget", both.reason);

  const r = await reviseCast(d.ficha, d.plan, d.castArt, instruction, llm);
  d.castArt = r.art;
  d.pagesArt = undefined;
  d.approvedSheetJobId = undefined;
  book = await save(store, book, d);
  const variant = sheets.length + 1;
  await store.insertJobs(sheetAndCover(book, d, variant));
  const sheet = sheetJobs(await store.listJobs(book.id)).find((j) => j.variant === variant);
  if (!sheet) return fail(500, "db");
  await store.insertJobs([coverRow(book, d, variant, sheet.id)]);
  const cover = coverJobs(await store.listJobs(book.id)).find((c) => sheetRefOf(c) === sheet.id);
  if (!cover) return fail(500, "db");
  return { ok: true, bookId: book.public_id, sheetJobId: sheet.id, coverJobId: cover.id, created: 2 };
}

/* ------------------------------ aprobar hoja, guardar textos ------------------------------ */

export async function approveSheet(store: GenStore, input: { bookId?: unknown; sheetJobId?: unknown }): Promise<{ ok: true } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  const sheet = sheetJobs(await store.listJobs(book.id)).find((j) => j.id === input.sheetJobId);
  if (!sheet || sheet.status !== "done") return fail(409, "sheet_not_ready");
  d.approvedSheetJobId = sheet.id;
  await save(store, book, d);
  return { ok: true };
}

/** El libro impreso ya ha salido hacia la imprenta: no admite cambios. */
async function printLocked(store: GenStore, bookUuid: string): Promise<boolean> {
  const o = await store.getOrder(bookUuid);
  return !!o?.printStatus && LOCKED_PRINT_STATUSES.includes(o.printStatus);
}
const lockedFail = () => fail(409, "printed", "El libro ya está en la imprenta y no se puede cambiar.");

/** Guarda el plan editado por el padre (textos, o una página reescrita). Las imágenes no se tocan aquí. */
export async function savePlan(store: GenStore, input: { bookId?: unknown; plan?: unknown }): Promise<{ ok: true } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  const plan = planFromClient(d.ficha, input.plan);
  if (!plan) return fail(400, "plan");
  if (await printLocked(store, book.id)) {
    // el guardado automático puede llegar después de mandarlo a imprimir con los mismos textos: eso no es un cambio
    const same = plan.title === d.plan.title && plan.dedication === d.plan.dedication && plan.pages.every((p, i) => p.text === d.plan.pages[i]?.text);
    return same ? { ok: true } : lockedFail();
  }
  const v = validatePlan(plan, d.ficha);
  if (!v.usable) return fail(422, "plan_invalid", v.issues.filter((i) => i.hard).map((i) => i.msg).slice(0, 3).join(" "));
  // el reparto inventado y la portada no cambian después del email: la hoja ya está pintada con ellos
  d.plan = { ...plan, extraCast: d.plan.extraCast, cover: d.plan.cover, places: d.plan.places, objects: d.plan.objects };
  await save(store, book, d);
  return { ok: true };
}

/** El padre elige qué versión de una página va al libro. */
export async function choosePage(store: GenStore, input: { bookId?: unknown; jobId?: unknown }): Promise<{ ok: true } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  if (await printLocked(store, book.id)) return lockedFail();
  const job = (await store.listJobs(book.id)).find((j) => j.id === input.jobId && j.kind === "page" && v2Of(j));
  if (!job || job.status !== "done" || !job.page_n) return fail(409, "page_not_ready");
  d.pageChoice = { ...(d.pageChoice ?? {}), [job.page_n]: job.id };
  await save(store, book, d);
  return { ok: true };
}

/* ------------------------------ pago simulado ------------------------------ */

export async function payDryRun(store: GenStore, input: { bookId?: unknown; edition?: unknown; shipping?: unknown; upgrade?: unknown }): Promise<{ ok: true } | Fail> {
  if (input.upgrade === true) {
    const up = await prepareUpgrade(store, input);
    if (!up.ok) return up;
    const loaded = await loadBook(store, input.bookId);
    if (isFail(loaded)) return loaded;
    await store.addPaidOrder(loaded.book.id, newOrder("hardcover", up.amountCents, `dry-run-mejora:${loaded.book.public_id}`, loaded.d.shipping));
    return { ok: true };
  }
  const prep = await prepareCheckout(store, input);
  if (!prep.ok) return prep;
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  if (!(await store.hasPaidOrder(book.id))) await store.addPaidOrder(book.id, newOrder(prep.edition, prep.amountCents, `dry-run:${book.public_id}`, d.shipping));
  return { ok: true };
}

function newOrder(edition: PaidEdition, amountCents: number, sessionId: string | null, shipping: Shipping | undefined) {
  return edition === "hardcover"
    ? { amountCents, edition, sessionId, shipping: shipping ?? null, printStatus: "awaiting_approval" as const }
    : { amountCents, edition, sessionId };
}

export interface CheckoutPrep {
  ok: true;
  bookId: string;
  email: string | null;
  title: string;
  edition: PaidEdition;
  amountCents: number;
  /** Pasar a tapa dura un libro ya pagado en PDF: se cobra solo la diferencia. */
  upgrade?: boolean;
}

/**
 * Antes de abrir el pago (real o de prueba): el libro existe y no está pagado, la edición es válida y, si es la tapa dura,
 * la dirección también. La edición y la dirección se guardan en el borrador y pasan al pedido cuando llega el pago.
 */
export async function prepareCheckout(store: GenStore, input: { bookId?: unknown; edition?: unknown; shipping?: unknown }, env: Env = process.env): Promise<CheckoutPrep | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  let { book } = loaded;
  const { d } = loaded;
  if (await paidHere(store, book.id, env)) return fail(409, "already_paid");
  const edition = paidEdition(input.edition) ?? "illustrated";
  if (edition === "hardcover") {
    const s = cleanShipping(input.shipping);
    if (!s.ok) return { ...fail(400, "shipping", s.message), field: s.field };
    d.shipping = s.shipping;
  }
  d.edition = edition;
  book = await save(store, book, d, edition === "hardcover" ? "hardcover" : "illustrated");
  return { ok: true, bookId: book.public_id, email: book.email, title: d.plan.title, edition, amountCents: PRICES[edition] };
}

/**
 * Pasar a tapa dura un libro ya pagado en PDF (24 oct): se cobra solo la diferencia. Hace falta un pedido PDF pagado, que
 * no haya ya uno de tapa dura, la dirección válida y que falte más de un día para que el libro caduque.
 */
export async function prepareUpgrade(
  store: GenStore,
  input: { bookId?: unknown; shipping?: unknown },
  now = Date.now(),
  env: Record<string, string | undefined> = process.env,
): Promise<CheckoutPrep | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  let { book } = loaded;
  const { d } = loaded;
  const order = await store.getOrder(book.id);
  if (!order) return fail(402, "not_paid");
  if (order.edition === "hardcover") return fail(409, "already_hardcover");
  // 25 oct: el PDF tiene que haberse cobrado de verdad en este entorno. La base es la misma que la de la preview: un PDF
  // pagado allí con la tarjeta de prueba no puede pasar a tapa dura impresa en producción pagando solo la diferencia
  if (!printableInEnv(order.sessionId, env)) return fail(409, "test_order", "Este libro se pagó en modo de prueba.");
  const amountCents = upgradeCents(order.amountCents);
  if (amountCents === null) return fail(409, "upgrade_unavailable");
  if (!upgradeDeadline(book.expiresAt, now)) return fail(409, "upgrade_closed");
  const s = cleanShipping(input.shipping);
  if (!s.ok) return { ...fail(400, "shipping", s.message), field: s.field };
  // la edición del libro no cambia hasta que llega el pago (si se abandona, sigue siendo el PDF)
  d.shipping = s.shipping;
  book = await save(store, book, d, d.edition ?? "illustrated");
  return { ok: true, bookId: book.public_id, email: book.email, title: d.plan.title, edition: "hardcover", amountCents, upgrade: true };
}

/** Cambiar la dirección de la tapa dura ya pagada, mientras no haya salido hacia la imprenta. */
export async function updateShipping(store: GenStore, input: { bookId?: unknown; shipping?: unknown }): Promise<{ ok: true; shipping: Shipping } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  const order = await store.getOrder(book.id);
  if (!order || order.edition !== "hardcover") return fail(409, "not_hardcover");
  if (order.printStatus && LOCKED_PRINT_STATUSES.includes(order.printStatus)) return lockedFail();
  const s = cleanShipping(input.shipping);
  if (!s.ok) return { ...fail(400, "shipping", s.message), field: s.field };
  await store.updateOrder(order.id, { shipping: s.shipping });
  await save(store, book, { ...d, shipping: s.shipping }, "hardcover");
  return { ok: true, shipping: s.shipping };
}

/* ------------------------------ pago con Stripe (webhook) ------------------------------ */

export interface PaidEvent {
  type: string;
  data: { object: { id?: string; payment_status?: string; amount_total?: number | null; currency?: string | null; metadata?: Record<string, string> | null; client_reference_id?: string | null } };
}

export type PaymentOutcome =
  | { action: "paid"; bookId: string; mismatch?: string }
  | { action: "upgraded"; bookId: string; mismatch?: string }
  /** La misma sesión otra vez (Stripe reintenta): nada que hacer. */
  | { action: "duplicate"; bookId: string }
  /** Otra sesión pagada para un libro ya pagado: cobro doble que hay que devolver (el webhook avisa). */
  | { action: "double_charge"; bookId: string }
  | { action: "ignored"; reason: string };

/** Importe o moneda distintos de lo esperado (no frena el pedido: el cliente ha pagado; el webhook avisa). */
function paymentMismatch(expectedCents: number | null, s: PaidEvent["data"]["object"]): string | undefined {
  const out: string[] = [];
  if (expectedCents !== null && typeof s.amount_total === "number" && s.amount_total !== expectedCents) out.push(`importe ${s.amount_total} c, se esperaban ${expectedCents} c`);
  if (typeof s.currency === "string" && s.currency.toLowerCase() !== "eur") out.push(`moneda ${s.currency}`);
  return out.length ? out.join("; ") : undefined;
}

/**
 * Registra el pedido de un `checkout.session.completed` (o `async_payment_succeeded`) ya verificado.
 * Idempotente: la misma sesión dos veces (Stripe reintenta) no crea otro pedido.
 * Auditoría 26 oct (B7 y B3): un libro caducado pero aún guardado se registra igual y se alarga; si la base falla, lanza
 * (el webhook responde 500 y Stripe reintenta); otra sesión pagada para el mismo libro es un cobro doble, no un
 * duplicado silencioso. El pago alarga el libro 30 días desde ese momento.
 */
export async function recordStripePayment(store: GenStore, event: PaidEvent, env: Record<string, string | undefined> = process.env): Promise<PaymentOutcome> {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return { action: "ignored", reason: event.type };
  const s = event.data?.object ?? {};
  if (s.payment_status !== "paid") return { action: "ignored", reason: `payment_status:${s.payment_status ?? "?"}` };
  const bookId = s.metadata?.bookId ?? s.client_reference_id ?? null;
  const loaded = await loadBook(store, bookId, { includeExpired: true });
  if (isFail(loaded)) return { action: "ignored", reason: `book:${loaded.error}` };
  const publicId = loaded.book.public_id;
  if (s.id && (await store.hasPaidOrder(loaded.book.id, (x) => x === s.id))) return { action: "duplicate", bookId: publicId };
  if (s.metadata?.upgrade === "1") return recordUpgrade(store, loaded, s, env);
  if (await paidHere(store, loaded.book.id, env)) return { action: "double_charge", bookId: publicId };
  const edition = paidEdition(s.metadata?.edition) ?? "illustrated";
  const amount = typeof s.amount_total === "number" ? s.amount_total : PRICES[edition];
  await store.addPaidOrder(loaded.book.id, newOrder(edition, amount, s.id ?? null, loaded.d.shipping));
  await store.extendBook(loaded.book.id, new Date(Date.now() + KEEP_AFTER_PAYMENT_MS).toISOString());
  const mismatch = paymentMismatch(PRICES[edition], s);
  return { action: "paid", bookId: publicId, ...(mismatch ? { mismatch } : {}) };
}


/**
 * La mejora a tapa dura pagada: un segundo pedido, de tapa dura, que espera a «Mandar a imprimir» como cualquier otro.
 * Las páginas ya están pintadas. Si el libro no tenía el PDF pagado o ya era de tapa dura, se ignora: lo que se cobró hay
 * que devolverlo a mano (el webhook avisa).
 */
async function recordUpgrade(
  store: GenStore,
  { book, d }: { book: BookRecord; d: BookDraftV2 },
  s: PaidEvent["data"]["object"],
  env: Record<string, string | undefined>,
): Promise<PaymentOutcome> {
  const order = await store.getOrder(book.id);
  if (order?.edition === "hardcover") return { action: "ignored", reason: "upgrade:already_hardcover" };
  if (!order) return { action: "ignored", reason: "upgrade:not_paid" };
  if (!printableInEnv(order.sessionId, env)) return { action: "ignored", reason: "upgrade:test_order" };
  const expected = upgradeCents(order.amountCents);
  const amount = typeof s.amount_total === "number" ? s.amount_total : (expected ?? 0);
  await store.addPaidOrder(book.id, newOrder("hardcover", amount, s.id ?? null, d.shipping));
  // 25 oct: pagada la tapa dura, el libro tiene que seguir ahí hasta «Mandar a imprimir», aunque faltara poco para que
  // caducara al pedir la mejora
  await store.extendBook(book.id, new Date(Date.now() + KEEP_AFTER_PAYMENT_MS).toISOString());
  d.edition = "hardcover";
  await save(store, book, d, "hardcover").catch(() => null);
  const mismatch = paymentMismatch(expected, s);
  return { action: "upgraded", bookId: book.public_id, ...(mismatch ? { mismatch } : {}) };
}

/**
 * Aviso a soporte (`MAIL_FORWARD_TO`) cuando un cobro de Stripe no acaba bien: no se ha podido registrar, es un cobro
 * doble o el importe no cuadra. Puro, para probarlo; lo manda el webhook. Auditoría 26 oct, B7: antes solo se avisaba de
 * las mejoras a tapa dura y el resto de cobros sin pedido pasaban sin que nadie se enterara.
 */
export function paymentNotice(r: PaymentOutcome, event: PaidEvent): { subject: string; text: string } | null {
  const s = event.data?.object ?? {};
  const paidSession = (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && s.payment_status === "paid";
  const upgrade = s.metadata?.upgrade === "1";
  const facts = `Libro: ${s.metadata?.bookId ?? s.client_reference_id ?? "?"}\nSesión: ${s.id ?? "?"}\nImporte: ${typeof s.amount_total === "number" ? (s.amount_total / 100).toFixed(2) : "?"} ${(s.currency ?? "eur").toUpperCase()}`;
  if (r.action === "ignored" && paidSession) {
    return {
      subject: upgrade ? "Mejora a tapa dura cobrada sin registrar" : "Cobro sin pedido",
      text: `Stripe cobró ${upgrade ? "una mejora a tapa dura" : "un libro"} que no se ha podido registrar (${r.reason}).\n${facts}\n\nRevísalo y devuélvelo desde el panel de Stripe si hace falta.`,
    };
  }
  if (r.action === "double_charge") {
    return { subject: "Cobro doble de un libro ya pagado", text: `El libro ya estaba pagado y ha llegado otro cobro de otra sesión de Stripe.\n${facts}\n\nDevuelve este segundo cobro desde el panel de Stripe.` };
  }
  if ((r.action === "paid" || r.action === "upgraded") && r.mismatch) {
    return { subject: "Cobro con un importe que no cuadra", text: `El pedido se ha registrado, pero ${r.mismatch}.\n${facts}\n\nRevísalo en el panel de Stripe.` };
  }
  return null;
}

/**
 * Cuando las 12 páginas están pintadas, manda una vez el email de «tu libro está listo» (el envío se inyecta: Resend en
 * la ruta, un doble en los tests). Devuelve si lo ha mandado.
 */
export async function notifyBookReady(
  store: GenStore,
  bookId: string,
  link: (id: string) => string,
  send: (to: string, title: string, link: string, edition: PaidEdition, upgrade?: UpgradeOffer | null) => Promise<{ sent: boolean }>,
): Promise<boolean> {
  const loaded = await loadBook(store, bookId);
  if (isFail(loaded)) return false;
  const { book, d } = loaded;
  if (d.readyMailedAt || !book.email) return false;
  const view = await bookView(store, bookId);
  if (!view.ok || !view.paid || !Object.values(view.chosen.pages).every(Boolean)) return false;
  const r = await send(book.email, d.plan.title, link(book.public_id), view.edition ?? "illustrated", view.upgrade);
  if (!r.sent) return false;
  const fresh = draftV2((await store.findBook({ publicId: bookId })) ?? book) ?? d;
  await save(store, book, { ...fresh, readyMailedAt: Date.now() });
  return true;
}

/** Ids de las páginas que esperan a pintarse (para el segundo plano). */
export async function pendingPageJobs(store: GenStore, bookId: string): Promise<string[]> {
  const book = await store.findBook({ publicId: bookId });
  if (!book) return [];
  // primero la portada que falte (ya pagada), después las 12 páginas y los retratos de los personajes
  const order = (j: GenJob) => (j.kind === "cover" ? -1 : j.kind === "page" ? 0 : 100) + (j.page_n ?? 0);
  return (await store.listJobs(book.id))
    .filter((j) => (j.kind === "page" || j.kind === "portrait" || (j.kind === "cover" && j.paid)) && v2Of(j) && j.status === "pending")
    .sort((a, b) => order(a) - order(b))
    .map((j) => j.id);
}

/* ------------------------------ tras el pago: páginas ------------------------------ */

function pageRow(book: BookRecord, d: BookDraftV2, n: number, variant: number, sheetJobId: string, redo?: { sceneEn: string } & PageFix): NewJob {
  const style = getStyle(d.ficha.styleId)!;
  const page = d.plan.pages[n - 1];
  const base = d.pagesArt!.pages.find((p) => p.n === n)!;
  const ap = redo ? { ...base, sceneEn: redo.sceneEn } : base;
  const prompt = pagePrompt(d.castArt!, page, ap, style, redo ?? {});
  return {
    book_id: book.id,
    kind: "page",
    page_n: n,
    variant,
    job_key: jobKey("page", n, variant, hashString(`${pageArtKey(d.castArt!, page)}|${prompt}|${sheetJobId}`)),
    style_id: style.id,
    prompt,
    references: [{ kind: "sheet", job_id: sheetJobId }, { kind: "anchor", style_id: style.id }, spec("3:2", "2K")] as unknown as NewJob["references"],
    paid: true,
  };
}

/** Página `n` pintada con la escena actual (la última versión que coincide), si la hay. */
function currentPageJobs(jobs: GenJob[], d: BookDraftV2, n: number, sheetJobId: string): GenJob[] {
  const page = d.plan.pages[n - 1];
  const prefix = pageArtKey(d.castArt!, page);
  return jobs.filter((j) => j.kind === "page" && j.page_n === n && v2Of(j) && sheetRefOf(j) === sheetJobId && j.job_key.endsWith(hashString(`${prefix}|${j.prompt}|${sheetJobId}`)));
}

/* ------------------------------ tras el pago: la portada, si falta ------------------------------ */

/**
 * 26 oct: un libro pagado nunca se queda sin portada. Si la de su hoja falló (o no existe), se encarga otra como trabajo
 * pagado (sin tope por lead), como los retratos. Si algo falla aquí, se avisa en el log y el resto del libro sigue.
 */
async function ensureCover(store: GenStore, book: BookRecord, d: BookDraftV2, sheetJobId: string, adapter: Pick<GenerationAdapter, "name">): Promise<string[]> {
  try {
    const jobs = await store.listJobs(book.id);
    const mine = coverJobs(jobs).filter((j) => sheetRefOf(j) === sheetJobId);
    if (mine.some((j) => j.status !== "failed")) return [];
    const retry = mine.find((j) => j.attempts < MAX_ATTEMPTS && j.paid);
    if (retry) return (await store.reopen(retry)) ? [retry.id] : [];
    const variant = coverJobs(jobs).length + 1;
    if (variant > DB_MAX_VARIANT) {
      console.warn(`[portada] ${book.public_id}: sin portada y sin versiones libres`);
      return [];
    }
    const row: NewJob = { ...coverRow(book, d, variant, sheetJobId), paid: true };
    const gate = await gateSpend(store.db, { leadId: book.id, images: 1, provider: adapter.name, paid: true, size: "2K" });
    if (!gate.ok) {
      console.warn(`[portada] sin presupuesto: ${gate.reason}`);
      return [];
    }
    await store.insertJobs([row]);
    return (await store.listJobs(book.id)).filter((j) => j.job_key === row.job_key).map((j) => j.id);
  } catch (e) {
    console.warn(`[portada] ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
    return [];
  }
}

/* ------------------------------ tras el pago: retratos de los personajes ------------------------------ */

/**
 * Página «así son los personajes» (25 oct): un retrato por personaje recurrente (page_n = posición en el reparto, desde
 * 1), cuadrado y a 1K, con la hoja aprobada como referencia. Va en vez de la hoja con todas las vistas. Si falla dos
 * veces, el libro usa la hoja (la maqueta nunca deja el hueco).
 */
export const MAX_PORTRAIT_JOBS = 2;

/**
 * Huella del retrato (25 oct): lo que es el personaje (nombre, aspecto, ropa), el estilo y la hoja. No el texto del
 * prompt: si el prompt cambia en un despliegue, los retratos ya pintados siguen valiendo y no se vuelven a pagar.
 */
function portraitKey(c: { name: string; kind: string; identityEn: string; outfitEn: string }, styleId: string, sheetJobId: string): string {
  return hashString(JSON.stringify([c.name, c.kind, c.identityEn, c.outfitEn, styleId, sheetJobId]));
}

function portraitRow(book: BookRecord, d: BookDraftV2, i: number, variant: number, sheetJobId: string): NewJob {
  const style = getStyle(d.ficha.styleId)!;
  const c = d.castArt!.cast[i];
  const prompt = portraitPrompt(c, style);
  return {
    book_id: book.id,
    kind: "portrait",
    page_n: i + 1,
    variant,
    job_key: jobKey("portrait", i + 1, variant, portraitKey(c, style.id, sheetJobId)),
    style_id: style.id,
    prompt,
    references: [{ kind: "sheet", job_id: sheetJobId }, { kind: "anchor", style_id: style.id }, spec("1:1", "1K")] as unknown as NewJob["references"],
    paid: true,
  };
}

/** Retratos del personaje `i` que siguen valiendo: misma hoja y mismo personaje (si cambió el reparto, ya no). */
function currentPortraitJobs(jobs: GenJob[], d: BookDraftV2, i: number, sheetJobId: string): GenJob[] {
  const c = d.castArt?.cast[i];
  const style = getStyle(d.ficha.styleId);
  if (!c || !style) return [];
  const want = portraitKey(c, style.id, sheetJobId);
  return jobs.filter((j) => j.kind === "portrait" && j.page_n === i + 1 && v2Of(j) && sheetRefOf(j) === sheetJobId && j.job_key.endsWith(want));
}

/**
 * Encola los retratos que falten (o reabre el que falló). No puede impedir las páginas: si algo falla aquí (presupuesto,
 * la base sin el tipo «portrait»), se avisa en el log y el libro sale con la hoja.
 */
async function ensurePortraits(store: GenStore, book: BookRecord, d: BookDraftV2, sheetJobId: string, adapter: Pick<GenerationAdapter, "name">): Promise<string[]> {
  try {
    const jobs = await store.listJobs(book.id);
    const wanted: NewJob[] = [];
    const reopened: string[] = [];
    for (let i = 0; i < (d.castArt?.cast.length ?? 0); i++) {
      const cur = currentPortraitJobs(jobs, d, i, sheetJobId);
      if (cur.some((j) => j.status !== "failed")) continue;
      const retry = cur.find((j) => j.attempts < MAX_ATTEMPTS);
      if (retry) {
        if (await store.reopen(retry)) reopened.push(retry.id);
        continue;
      }
      const all = jobs.filter((j) => j.kind === "portrait" && j.page_n === i + 1);
      if (all.length >= MAX_PORTRAIT_JOBS) continue;
      wanted.push(portraitRow(book, d, i, all.length + 1, sheetJobId));
    }
    if (wanted.length > 0) {
      const gate = await gateSpend(store.db, { leadId: book.id, images: wanted.length, provider: adapter.name, paid: true, size: "1K" });
      if (!gate.ok) {
        console.warn(`[retratos] sin presupuesto: ${gate.reason}`);
        return reopened;
      }
      await store.insertJobs(wanted);
    }
    const keys = new Set(wanted.map((w) => w.job_key));
    const created = wanted.length ? (await store.listJobs(book.id)).filter((j) => keys.has(j.job_key)).map((j) => j.id) : [];
    return [...created, ...reopened];
  } catch (e) {
    console.warn(`[retratos] ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
    return [];
  }
}

export async function requestPages(
  store: GenStore,
  input: { bookId?: unknown; page?: unknown; reason?: unknown; note?: unknown },
  adapter: Pick<GenerationAdapter, "name">,
  { dryRunPayment, env = process.env }: { dryRunPayment: boolean; env?: Env },
  llm: Llm = selectLlm("art"),
): Promise<{ ok: true; bookId: string; jobs: string[]; created: number } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  let { book } = loaded;
  const { d } = loaded;
  if (!(await paidHere(store, book.id, env)) && !dryRunPayment) return fail(402, "not_paid");
  if (await printLocked(store, book.id)) return lockedFail();
  if (!d.castArt) return fail(409, "no_sheet");
  let jobs = await store.listJobs(book.id);
  const sheets = sheetJobs(jobs).filter((j) => j.status === "done");
  const sheet = sheets.find((j) => j.id === d.approvedSheetJobId) ?? sheets[sheets.length - 1];
  if (!sheet) return fail(409, "sheet_not_ready");

  const needKey = pagesArtKey(d.castArt, d.plan) !== d.pagesArt?.key;
  if (!d.pagesArt || needKey) {
    const r = await pagesArt(d.ficha, d.plan, d.castArt, llm);
    d.pagesArt = r.art;
    book = await save(store, book, d);
    // la dirección de arte tarda: si otra petición (el webhook del pago y el navegador a la vez) ya ha encolado las
    // páginas mientras, se ven aquí y no se pintan dos veces
    jobs = await store.listJobs(book.id);
  }

  const wanted: NewJob[] = [];
  const reopenedIds: string[] = [];
  let redo: { reason: RedoReason; note: string | null } | null = null;
  if (input.page !== undefined) {
    const n = Number(input.page);
    if (!Number.isInteger(n) || n < 1 || n > 12) return fail(400, "page");
    // «Otra versión» con motivo: sin motivo ni nota no hay versión nueva (es lo que permite corregirla)
    const note = cleanNote(input.note);
    const reason = isRedoReason(input.reason) ? input.reason : note ? "otro" : null;
    if (!reason) return fail(400, "reason", "Dinos qué no te gusta de esta ilustración.");
    const bad = note ? (blockedWord(note) ?? contactData(note)) : null;
    if (bad) return fail(422, "moderation", `Eso no lo podemos poner en un cuento infantil («${bad}»).`);
    const all = jobs.filter((j) => j.kind === "page" && j.page_n === n && v2Of(j));
    const current = currentPageJobs(jobs, d, n, sheet.id).filter((j) => j.status !== "failed");
    if (all.length >= MAX_PAGE_JOBS || current.length >= 1 + MAX_PAGE_REDOS) return fail(409, "max_versions", "Esta página ya no admite más versiones.");
    const redos = jobs.filter((j) => j.kind === "page" && j.variant > 1 && v2Of(j)).length;
    if (redos >= MAX_BOOK_REDOS) return fail(409, "max_versions", "Ya has usado las versiones extra de este libro. Si alguna página sigue sin estar bien, avísanos desde esa página.");
    // la escena se reescribe con el motivo; si falla el modelo, se usa la corrección fija del motivo
    const ap = d.pagesArt!.pages.find((p) => p.n === n)!;
    const page = d.plan.pages[n - 1];
    let fix: { sceneEn: string; fixEn: string } = { sceneEn: ap.sceneEn, fixEn: REDO_FIX_EN[reason] };
    try {
      const r = await redoScene(d.castArt!, page, ap, REDO_REASONS[reason], note, llm);
      fix = { sceneEn: r.sceneEn, fixEn: [REDO_FIX_EN[reason], r.fixEn].filter(Boolean).join(" ") };
    } catch (e) {
      console.warn(`[redo] ${e instanceof Error ? e.message.slice(0, 160) : "error"}`);
    }
    // la última versión posible de la página, con la escena simplificada
    const simple = current.length + 1 === 1 + MAX_PAGE_REDOS;
    wanted.push(pageRow(book, d, n, all.length + 1, sheet.id, { ...fix, simple }));
    redo = { reason, note };
  } else {
    for (let n = 1; n <= 12; n++) {
      const cur = currentPageJobs(jobs, d, n, sheet.id);
      if (cur.some((j) => j.status !== "failed")) continue;
      const retry = cur.find((j) => j.attempts < MAX_ATTEMPTS);
      if (retry) {
        if (await store.reopen(retry)) reopenedIds.push(retry.id);
        continue;
      }
      const all = jobs.filter((j) => j.kind === "page" && j.page_n === n && v2Of(j));
      if (all.length >= MAX_PAGE_JOBS) continue;
      wanted.push(pageRow(book, d, n, all.length + 1, sheet.id));
    }
  }
  if (wanted.length > 0) {
    const gate = await gateSpend(store.db, { leadId: book.id, images: wanted.length, provider: adapter.name, paid: true, size: "2K" });
    if (!gate.ok) return fail(429, "budget", gate.reason);
  }
  await store.insertJobs(wanted);
  if (wanted.length > 0) await store.markIllustrating(book.id);
  const keys = new Set(wanted.map((w) => w.job_key));
  const after = await store.listJobs(book.id);
  const created = after.filter((j) => keys.has(j.job_key));
  if (redo && created[0]) {
    // el motivo se apunta aunque falle el guardado: no puede impedir la versión nueva
    await store
      .addFeedback({ book_id: book.id, job_id: created[0].id, kind: "redo", page_n: created[0].page_n!, variant: created[0].variant, reason: redo.reason, note: redo.note, style_id: created[0].style_id })
      .catch((e) => console.warn(`[redo] feedback: ${e instanceof Error ? e.message.slice(0, 160) : "error"}`));
  }
  // con el libro entero (no con «Otra versión» de una página), también los retratos de la página de personajes
  const portraits = input.page === undefined ? await ensurePortraits(store, book, d, sheet.id, adapter) : [];
  const coverIds = input.page === undefined ? await ensureCover(store, book, d, sheet.id, adapter) : [];
  return { ok: true, bookId: book.public_id, jobs: [...created.map((j) => j.id), ...reopenedIds, ...portraits, ...coverIds], created: wanted.length };
}

/**
 * «Sigue sin estar bien» (sin versiones o sin que ninguna valga): queda apuntado y nos llega un email para arreglarla a
 * mano. Una vez por página. `notify` manda el email (lib/mail.ts); en las pruebas, un doble.
 */
export async function reportPage(
  store: GenStore,
  input: { bookId?: unknown; page?: unknown; note?: unknown },
  notify: (subject: string, text: string) => Promise<{ sent: boolean }>,
  link: (publicId: string) => string,
  env: Env = process.env,
): Promise<{ ok: true } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  if (!(await paidHere(store, book.id, env))) return fail(402, "not_paid");
  const n = Number(input.page);
  if (!Number.isInteger(n) || n < 1 || n > 12) return fail(400, "page");
  const note = cleanNote(input.note);
  const bad = note ? (blockedWord(note) ?? contactData(note)) : null;
  if (bad) return fail(422, "moderation", `Eso no lo podemos poner en un cuento infantil («${bad}»).`);
  const prior = await store.listFeedback(book.id);
  if (prior.some((f) => f.kind === "report" && f.page_n === n)) return fail(409, "already_reported", "Ya nos has avisado de esta página. La estamos mirando.");
  await store.addFeedback({ book_id: book.id, job_id: null, kind: "report", page_n: n, variant: null, reason: "sigue_mal", note, style_id: d.ficha.styleId });
  const redos = prior.filter((f) => f.kind === "redo" && f.page_n === n).map((f) => `- versión ${f.variant ?? "?"}: ${REDO_REASONS[f.reason as RedoReason] ?? f.reason}${f.note ? `: «${f.note}»` : ""}`);
  const text = [
    `Página ${n} del libro «${d.plan.title}» (${book.public_id}).`,
    note ? `Lo que dice: «${note}»` : "No ha escrito nada más.",
    redos.length ? `Versiones que pidió antes:\n${redos.join("\n")}` : "No pidió otras versiones con motivo.",
    `Escena: ${d.plan.pages[n - 1]?.scene ?? ""}`,
    `Libro: ${link(book.public_id)}`,
  ].join("\n\n");
  const sent = await notify(`Sigue sin estar bien: página ${n} de «${d.plan.title}»`, text);
  if (!sent.sent) console.warn(`[report] aviso sin enviar (${book.public_id}, página ${n})`);
  return { ok: true };
}


/* ------------------------------ estado ------------------------------ */

export interface BookJobView {
  id: string;
  kind: "sheet" | "cover" | "page" | "portrait";
  page: number | null;
  variant: number;
  status: GenJob["status"];
  url: string | null;
  placeholder: boolean;
  error: "budget" | "error" | null;
  /** Sigue siendo la imagen de la escena actual (si el padre cambió la página después, ya no). */
  current: boolean;
  sheetJobId: string | null;
  /** Encargada tras el pago (las páginas, los retratos y una portada que faltaba). */
  paid: boolean;
}

export interface BookView {
  ok: true;
  bookId: string;
  ficha: Ficha;
  plan: Plan;
  paid: boolean;
  approvedSheetJobId: string | null;
  sheetsLeft: number;
  /** Versiones con motivo que quedan en el libro (tope MAX_BOOK_REDOS). */
  redosLeft: number;
  /** Páginas de las que ya avisó con «Sigue sin estar bien». */
  reported: number[];
  jobs: BookJobView[];
  /** Lo que va al libro: portada de la hoja aprobada (o la última) y la versión elegida de cada página. */
  chosen: {
    sheet: string | null;
    cover: string | null;
    pages: Record<number, string | null>;
    /** Un retrato por personaje del reparto, en orden (job o null si aún no está). Vacío sin reparto. */
    portraits: { name: string; job: string | null }[];
  };
  /**
   * Pagado y a algún personaje le falta el retrato sin ninguno en marcha, pero aún se puede pedir (25 oct): el navegador
   * vuelve a pedir el libro entero (no repinta páginas) para que no se queden sin pintar si el segundo plano no llegó.
   */
  portraitsToRequest: boolean;
  /** Edición pagada (null sin pagar). */
  edition: PaidEdition | null;
  /** Pagado en PDF: lo que cuesta pasar a tapa dura y hasta cuándo se puede (null si no se puede). La ruta lo quita si aquí no hay imprenta. */
  upgrade: UpgradeOffer | null;
  /** Libro de tapa dura: dirección, estado en la imprenta y seguimiento (el modo lo pone la ruta). */
  print: Omit<PrintView, "mode"> | null;
  /** Los pone la ruta /api/libro/view: cómo se paga aquí, si se mandan emails y si se pinta en segundo plano. */
  payment?: "stripe" | "dry-run" | "none";
  /** Si la tapa dura se puede comprar aquí (imprenta real o simulada) y cómo. */
  printMode?: PrintView["mode"];
  mail?: boolean;
  background?: boolean;
  /** Email de contacto (LEGAL_EMAIL), para «si te han cobrado y no aparece, escríbenos». Lo añade la ruta. */
  contact?: string | null;
}

export interface UpgradeOffer {
  cents: number;
  /** Último momento para pedirla (ISO). */
  until: string;
}

export function upgradeOffer(
  book: Pick<BookRecord, "expiresAt">,
  order: Pick<PaidOrder, "edition" | "amountCents" | "sessionId"> | null,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env,
): UpgradeOffer | null {
  if (order?.edition !== "illustrated" || !printableInEnv(order.sessionId, env)) return null;
  const cents = upgradeCents(order.amountCents);
  const until = upgradeDeadline(book.expiresAt, now);
  return cents !== null && until ? { cents, until } : null;
}

export async function bookView(store: GenStore, bookId: unknown, env: Env = process.env): Promise<BookView | Fail> {
  const loaded = await loadBook(store, bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  const jobs = (await store.listJobs(book.id)).filter((j) => v2Of(j));
  const sheets = sheetJobs(jobs);
  const out: BookJobView[] = [];
  for (const j of jobs) {
    const sheetId = sheetRefOf(j);
    const current =
      j.kind === "page" && d.castArt && d.pagesArt && sheetId
        ? currentPageJobs([j], d, j.page_n!, sheetId).length > 0
        : j.kind === "portrait"
          ? !!sheetId && currentPortraitJobs([j], d, (j.page_n ?? 0) - 1, sheetId).length > 0
          : true;
    out.push({
      id: j.id,
      kind: j.kind as BookJobView["kind"],
      page: j.page_n,
      variant: j.variant,
      status: j.status,
      url: j.status === "done" && j.storage_path ? await store.signedUrl(j.storage_path, 3600) : null,
      placeholder: j.status === "done" && !j.storage_path,
      error: j.status === "failed" ? (j.error?.startsWith("presupuesto") ? "budget" : "error") : null,
      current,
      sheetJobId: sheetId,
      paid: !!j.paid,
    });
  }
  const doneSheets = out.filter((j) => j.kind === "sheet" && j.status === "done");
  const sheet = doneSheets.find((j) => j.id === d.approvedSheetJobId) ?? doneSheets[doneSheets.length - 1] ?? null;
  const cover = sheet ? [...out].reverse().find((j) => j.kind === "cover" && j.status === "done" && j.sheetJobId === sheet.id) ?? null : null;
  const pages: Record<number, string | null> = {};
  for (let n = 1; n <= 12; n++) {
    const options = out.filter((j) => j.kind === "page" && j.page === n && j.status === "done" && j.current);
    const pick = options.find((j) => j.id === d.pageChoice?.[n]) ?? options[options.length - 1] ?? null;
    pages[n] = pick?.id ?? null;
  }
  const portraits = (d.castArt?.cast ?? []).map((c, i) => {
    const done = out.filter((j) => j.kind === "portrait" && j.page === i + 1 && j.status === "done" && j.current && j.sheetJobId === sheet?.id);
    // sin nombre, el reparto usa la relación («su perro»): bajo el retrato, con mayúscula
    return { name: c.name.charAt(0).toUpperCase() + c.name.slice(1), job: done[done.length - 1]?.id ?? null };
  });
  // en producción, un pedido de prueba de la preview no existe: ni pagado, ni edición, ni panel de imprenta
  const lastOrder = await store.getOrder(book.id);
  const order = lastOrder && paidInEnv(lastOrder.sessionId, env) ? lastOrder : null;
  const feedback = await store.listFeedback(book.id).catch(() => []);
  // ya enviado a la imprenta, el libro no cambia: no se piden retratos que no van a ir en él
  const portraitsToRequest =
    !!order &&
    !!sheet &&
    !(order.printStatus && LOCKED_PRINT_STATUSES.includes(order.printStatus)) &&
    (d.castArt?.cast ?? []).some((_, i) => {
      const cur = currentPortraitJobs(jobs, d, i, sheet.id);
      if (cur.some((j) => j.status !== "failed")) return false;
      return cur.some((j) => j.attempts < MAX_ATTEMPTS) || jobs.filter((j) => j.kind === "portrait" && j.page_n === i + 1).length < MAX_PORTRAIT_JOBS;
    });
  return {
    ok: true,
    bookId: book.public_id,
    redosLeft: Math.max(0, MAX_BOOK_REDOS - jobs.filter((j) => j.kind === "page" && j.variant > 1).length),
    reported: [...new Set(feedback.filter((f) => f.kind === "report").map((f) => f.page_n))],
    ficha: d.ficha,
    plan: d.plan,
    paid: await paidHere(store, book.id, env),
    edition: order?.edition ?? null,
    upgrade: upgradeOffer(book, order ?? null, Date.now(), env),
    print:
      order?.edition === "hardcover" && order.printStatus
        ? {
            status: order.printStatus,
            shipping: order.shipping ?? d.shipping ?? null,
            trackingUrl: order.trackingUrl,
            sentAt: order.sentAt,
            trackPath: order.sentAt ? `/seguimiento/${order.id}` : null,
          }
        : null,
    approvedSheetJobId: d.approvedSheetJobId ?? null,
    sheetsLeft: Math.max(0, MAX_SHEETS - sheets.length),
    jobs: out,
    chosen: { sheet: sheet?.id ?? null, cover: cover?.id ?? null, pages, portraits },
    portraitsToRequest,
  };
}

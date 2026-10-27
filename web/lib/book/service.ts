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
import { MAX_ATTEMPTS, STALE_RUNNING_MS, gateSpend, v2Of, type Fail, type V2Spec } from "../generation/service";
import { jobKey } from "../generation/keys";
import { VIEW_URL_SECONDS } from "../signing";
import { bookLine, bookRef } from "../support";
import type { BookRecord, GenJob, GenStore, NewJob } from "../generation/store";
import { estimatedCostCents, type GenerationAdapter } from "../generation/adapter";
import { canSpend, freeBookCapCents } from "../generation/budget";
import { passFreeGate } from "./freeLimit";
import { castArt, castArtKey, coverPrompt, pageArtKey, pagePrompt, pagesArt, pagesArtKey, portraitPrompt, redoScene, reviseCast, sheetPrompt, type CastArt, type PageFix, type PagesArt } from "../plan/art";
import { MAX_BOOK_REDOS, MAX_PAGE_REDOS, REDO_FIX_EN, REDO_REASONS, cleanNote, isRedoReason, type RedoReason } from "./feedback";
import { fichaHash, normalizeFicha } from "../plan/ficha";
import { blockedWord, contactData } from "../plan/moderation";
import { planFromClient } from "../plan/planner";
import { dropOrphanFamilyExtras, validatePlan, type PlanValidation } from "../plan/validate";
import type { Ficha, Plan } from "../plan/types";
import { cleanShipping, shippingLine, shippingSummary } from "../print/shipping";
import type { Receipt } from "../mail";
import { EDITION_LABEL, PRICE_CENTS as PRICES, paidEdition, upgradeCents, upgradeDeadline } from "../print/prices";
import { LOCKED_PRINT_STATUSES, type PaidEdition, type PaidOrder, type PrintView, type Shipping, type ShippingSummary } from "../print/types";
import { paidInEnv, printableInEnv } from "../stripe";

type Env = Record<string, string | undefined>;

/** ¿El libro está pagado en este entorno? En producción solo cuentan los cobros reales (`paidInEnv`, auditoría 26 oct). */
function paidHere(store: GenStore, bookUuid: string, env: Env): Promise<boolean> {
  return store.hasPaidOrder(bookUuid, (s) => paidInEnv(s, env));
}

/**
 * Tras pagar, los personajes y las escenas ya no cambian (auditoría 26 oct, I2): cambiarlos repintaba el libro entero a
 * nuestra costa y gastaba las «Otra versión» del padre. Los textos sí se pueden seguir corrigiendo.
 */
const paidFail = () => fail(409, "already_paid", "El libro ya está pagado: los personajes y las escenas ya no cambian. Para una ilustración, pide otra versión desde esa página.");

/** Un libro pagado se guarda 30 días desde el pago (no desde que se empezó): auditoría 26 oct, B3. */
const KEEP_AFTER_PAYMENT_MS = 30 * 24 * 3600 * 1000;

export const MAX_SHEETS = 3; // la primera + 2 cambios con palabras
/**
 * Lo que admite la base (cuentos_generation_jobs_variant_check): 1..4 desde supabase/migrations/0012_cuentos_12_variant_hasta_4.sql
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
  /** Dirección de arte en marcha (I1): otra petición que llegue a la vez espera a esta en vez de pagar otra. */
  pagesArtPending?: { key: string; at: number };
  approvedSheetJobId?: string;
  /** Versión elegida de cada página (id del job); sin elegir, la última pintada de la escena actual. */
  pageChoice?: Record<number, string>;
  /** Email de «tu libro está listo» enviado (una vez). */
  readyMailedAt?: number;
  /** Cuándo se avisó a soporte de que el libro pagado no terminaba (rescate, auditoría 26 oct, B4): una vez por libro. */
  stuckAlertedAt?: number;
  /** Jobs de imágenes pagadas que no salen de los que ya se avisó a soporte (I3): cada uno, una vez. */
  failAlertedJobs?: string[];
  /** Sesiones de Stripe de las que ya se mandó el recibo (I28): una vez por cobro, aunque Stripe reintente. */
  receiptSessions?: string[];
  /** Edición elegida al abrir el pago y dirección de envío de la tapa dura (pasan al pedido cuando llega el pago). */
  edition?: PaidEdition;
  shipping?: Shipping;
  /**
   * La dirección con la que se abrió cada sesión de pago de tapa dura, por id de sesión de Stripe (las últimas). El pedido
   * lleva la de la sesión que se paga, no la última escrita: con dos pestañas y dos direcciones ganaba la última que se
   * abría (menores de la auditoría 26 oct). Se vacía al registrar el pago; el borrado diario quita las abandonadas.
   */
  checkoutShipping?: Record<string, Shipping>;
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
/** La portada más reciente de una hoja: puede haber varias si una falló del todo (auditoría 26 oct, B8). */
function lastCoverOf(jobs: GenJob[], sheetJobId: string): GenJob | undefined {
  const mine = coverJobs(jobs).filter((c) => sheetRefOf(c) === sheetJobId);
  return mine[mine.length - 1];
}
/** Falló y ya no le quedan intentos: para repetirla hay que pintar otra (B8). */
function spent(job: GenJob): boolean {
  return job.status === "failed" && job.attempts >= MAX_ATTEMPTS;
}
/** Tiene personajes dibujados o en camino: cuenta como cuento con dibujos (lib/book/freeLimit.ts). */
function hasArt(sheets: GenJob[]): boolean {
  return sheets.some((j) => j.status !== "failed");
}
/**
 * Versiones de la hoja que quedan: tres que salgan (la primera y dos cambios con palabras). Las que fallaron del todo no
 * gastan una (B8), pero nunca más de las que admite la base.
 */
function sheetsLeftOf(sheets: GenJob[]): number {
  return Math.max(0, Math.min(MAX_SHEETS - sheets.filter((j) => !spent(j)).length, DB_MAX_VARIANT - sheets.length));
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

/**
 * Cambia el borrador sin pisar lo que otra petición haya guardado mientras (auditoría 26 oct, I13). Antes cada acción
 * reescribía el borrador entero que había leído, y la dirección de arte (de 5 a 20 s) borraba un texto corregido entre
 * medias. Ahora guarda solo si nadie lo ha tocado desde que se leyó (`updated_at`); si choca, vuelve a leer y aplica
 * otra vez su cambio. `change` recibe el borrador de ahora y devuelve el nuevo, o null si ya no hay nada que cambiar.
 */
async function mutate(store: GenStore, book: BookRecord, change: (d: BookDraftV2) => BookDraftV2 | null): Promise<{ book: BookRecord; d: BookDraftV2 }> {
  let cur = book;
  for (let attempt = 0; attempt < 5; attempt++) {
    const d = draftV2(cur);
    if (!d) throw new Error("books: not_v2");
    const next = change(d);
    if (!next) return { book: cur, d };
    const write = { publicId: cur.public_id, email: cur.email, draft: { ...next, updatedAt: Date.now() }, edition: next.edition ?? "illustrated" };
    // sin marca de la base (almacenes antiguos), como antes
    if (!cur.updatedAt) return { book: await store.saveBook(write), d: next };
    const saved = await store.saveBookIf({ ...write, ifUpdatedAt: cur.updatedAt });
    if (saved) return { book: saved, d: next };
    const again = await store.findBook({ publicId: cur.public_id, includeExpired: true });
    if (!again) throw new Error("books: not_found");
    cur = again;
  }
  throw new Error("books: conflicto al guardar");
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

/**
 * Lo que se le dice al padre si el cuento que manda no vale (auditoría 26 oct, B6): el primer problema dicho para él.
 * Los mensajes para el modelo («quítalos de extraCast…») solo van al log.
 */
function planProblem(v: PlanValidation): string {
  const hard = v.issues.filter((i) => i.hard);
  // solo cuántos: el texto de los avisos lleva nombres del cuento (I24)
  console.warn(`[libro] plan no válido: ${hard.length} avisos graves`);
  return hard.find((i) => i.parent)?.parent ?? "Hay algo en el cuento que no podemos usar. Revisa los textos o escríbenos.";
}

/** Guarda ficha + plan con el email, prepara la dirección de arte del reparto y encola hoja + portada (una vez). */
export async function startBook(store: GenStore, input: StartInput, adapter: Pick<GenerationAdapter, "name">, llm: Llm = selectLlm("art"), env: Env = process.env): Promise<StartResult | Fail> {
  const email = cleanEmail(input.email);
  if (!email) return fail(400, "email");
  const ficha = normalizeFicha(input.ficha);
  if (!ficha.hero.name) return fail(400, "ficha");
  const raw = planFromClient(ficha, input.plan);
  if (!raw) return fail(400, "plan");
  const plan = dropOrphanFamilyExtras(raw, ficha);
  const v = validatePlan(plan, ficha, { fromParent: true });
  if (!v.usable) return fail(422, "plan_invalid", planProblem(v));
  if (!getStyle(ficha.styleId)) return fail(400, "style_id");
  const meta = (input.planMeta && typeof input.planMeta === "object" ? input.planMeta : {}) as Record<string, unknown>;

  let book: BookRecord | null = null;
  let prev: BookDraftV2 | null = null;
  if (typeof input.bookId === "string" && /^[a-z0-9]{8,16}$/.test(input.bookId)) {
    book = await store.findBook({ publicId: input.bookId });
    prev = book ? draftV2(book) : null;
    if (book && book.email && book.email !== email) book = null; // otro email: libro nuevo
    else if (book && (await paidHere(store, book.id, env))) return paidFail();
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
    checkoutShipping: prev?.checkoutShipping,
    updatedAt: Date.now(),
  };
  book = await store.saveBook({ publicId: book?.public_id, email, draft: d, edition: "illustrated" });

  const existing = await store.listJobs(book.id);
  const key = castArtKey(ficha, plan);
  const sheets = sheetJobs(existing);
  const current = d.castArt?.key === key ? sheets.filter((j) => j.prompt === sheetPrompt(d.castArt!, getStyle(ficha.styleId)!)) : [];

  // la puerta (26 oct): cuántos cuentos con dibujos lleva este buzón sin pagar. Se mira antes de dibujar el primero:
  // un cuento que empieza siempre termina. Un libro cuyos dibujos fallaron todos aún no cuenta (B8)
  const gate = await freeGate(store, email, book, sheets);
  if ("error" in gate) return gate;
  const { freeLeft } = gate;
  const saved = book;

  return afterGate(store, saved, gate.claimed, async () => {
    let book = saved;
    // ya hay hoja para este reparto: no se gasta otra vez (lo fallido se reabre; si ya no le quedan intentos, otra versión)
    if (current.length > 0) {
      const r = await reviveCast(store, book, d, existing, current[current.length - 1], adapter);
      if (r) return r.ok ? { ...r, freeLeft } : r;
    }
    if (sheetsLeftOf(sheets) <= 0) return fail(409, "max_versions", "Ya has usado las versiones de la hoja de este libro.");

    // hoja + portada tienen que caber en el presupuesto del libro y en el del día
    const both = await gateSpendCents(store, book.id, sheetAndCoverCents(adapter.name));
    if (!both.ok) return fail(402, "budget", both.reason);

    let drawn = d;
    if (d.castArt?.key !== key) {
      const art = (await castArt(ficha, plan, llm)).art;
      ({ book, d: drawn } = await mutate(store, book, (cur) => ({ ...cur, castArt: art, pagesArt: undefined })));
    }

    const variant = sheets.length + 1;
    const made = await newSheetAndCover(store, book, drawn, variant);
    if (isFail(made)) return made;
    return { ok: true, bookId: book.public_id, sheetJobId: made.sheet.id, coverJobId: made.cover.id, created: 2, fresh: variant === 1, email, title: plan.title, freeLeft };
  });
}

/**
 * Lo que va detrás de la puerta de los gratis. Si se sale sin hoja nueva (el modelo de arte falla, el presupuesto, las
 * versiones), el libro deja de contar como empezado: si no, tres fallos seguidos agotaban los gratis sin un solo dibujo
 * (revisión 27 oct).
 */
async function afterGate<T extends { ok: boolean }>(store: GenStore, book: BookRecord, claimed: boolean | undefined, run: () => Promise<T>): Promise<T> {
  if (!claimed) return run();
  let r: T;
  try {
    r = await run();
  } catch (e) {
    await store.claimFree(book.id, null).catch(() => null);
    throw e;
  }
  if (!r.ok) await store.claimFree(book.id, null).catch(() => null);
  return r;
}

/** La puerta de los cuentos gratis, solo para un libro que aún no tiene personajes (sin hoja o con todas fallidas). */
async function freeGate(store: GenStore, email: string, book: BookRecord, sheets: GenJob[]): Promise<{ freeLeft?: number; claimed?: boolean } | FreeLimitFail | Fail> {
  if (hasArt(sheets)) return {};
  // con el bloqueo del buzón: varias peticiones a la vez con el mismo email no pasan todas (auditoría 26 oct, I7)
  const gate = await passFreeGate(store, email, book.id);
  if (gate.ok) {
    // la marca cambia updated_at: el primer guardado condicional del borrador no choca con ella (revisión 27 oct)
    if (gate.updatedAt) book.updatedAt = gate.updatedAt;
    return { freeLeft: gate.left, claimed: true };
  }
  if ("busy" in gate) return fail(409, "busy", "Estamos empezando otro cuento con este email. Espera unos segundos y vuelve a intentarlo.");
  return { ok: false, status: 429, error: "free_limit", books: gate.books.map((b) => ({ publicId: b.publicId, title: b.title ?? "Tu cuento" })) };
}

async function newSheetAndCover(store: GenStore, book: BookRecord, d: BookDraftV2, variant: number): Promise<{ sheet: GenJob; cover: GenJob } | Fail> {
  await store.insertJobs(sheetAndCover(book, d, variant));
  const sheet = sheetJobs(await store.listJobs(book.id)).find((j) => j.variant === variant);
  if (!sheet) return fail(500, "db");
  await store.insertJobs([coverRow(book, d, variant, sheet.id)]);
  const cover = lastCoverOf(await store.listJobs(book.id), sheet.id);
  if (!cover) return fail(500, "db");
  return { sheet, cover };
}

/**
 * Vuelve a poner en marcha una hoja y su portada si fallaron (B8): lo fallido con intentos libres se reabre y una portada
 * sin intentos se pinta otra vez para la misma hoja. Una hoja sin intentos no se arregla aquí: devuelve null y toca
 * pintar otra versión. Si nada falló, no cambia nada.
 */
async function reviveCast(store: GenStore, book: BookRecord, d: BookDraftV2, jobs: GenJob[], sheet: GenJob, adapter: Pick<GenerationAdapter, "name">): Promise<StartResult | Fail | null> {
  if (spent(sheet)) return null;
  let cover = lastCoverOf(jobs, sheet.id);
  let row: NewJob | null = null;
  if (!cover || spent(cover)) {
    const variant = coverJobs(jobs).length + 1;
    if (variant > DB_MAX_VARIANT) return fail(409, "max_versions", "Ya no podemos repetir la portada de este libro. Escríbenos y lo miramos.");
    const gate = await gateSpendCents(store, book.id, estimatedCostCents(adapter.name, "2K"));
    if (!gate.ok) return fail(402, "budget", gate.reason);
    row = coverRow(book, d, variant, sheet.id);
  }
  let reopened = 0;
  for (const j of [sheet, ...(row ? [] : [cover!])]) if (j.status === "failed" && (await store.reopen(j))) reopened++;
  if (row) {
    await store.insertJobs([row]);
    cover = (await store.listJobs(book.id)).find((j) => j.job_key === row.job_key);
    if (!cover) return fail(500, "db");
  }
  return { ok: true, bookId: book.public_id, sheetJobId: sheet.id, coverJobId: cover!.id, created: row ? 1 : 0, reopened };
}

/**
 * «Reintentar» del paso 4 (auditoría 26 oct, B8): si la última hoja o su portada fallaron (Gemini 503 o 429), se vuelven
 * a pintar sin empezar otro cuento. Con lo guardado en el libro: no hacen falta el email ni la ficha.
 */
export async function retryCast(store: GenStore, input: { bookId?: unknown }, adapter: Pick<GenerationAdapter, "name">, env: Env = process.env): Promise<StartResult | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  if (!d.castArt || !book.email) return fail(409, "no_sheet");
  if (await paidHere(store, book.id, env)) return fail(409, "already_paid");
  const jobs = await store.listJobs(book.id);
  const sheets = sheetJobs(jobs);
  const sheet = sheets[sheets.length - 1];
  if (!sheet) return fail(409, "no_sheet");
  const gate = await freeGate(store, book.email, book, sheets);
  if ("error" in gate) return gate;
  return afterGate(store, book, gate.claimed, async (): Promise<StartResult | Fail> => {
    const r = await reviveCast(store, book, d, jobs, sheet, adapter);
    if (r) return r.ok ? { ...r, freeLeft: gate.freeLeft } : r;
    // la última hoja ya no tiene intentos: otra versión del mismo reparto
    if (sheetsLeftOf(sheets) <= 0) return fail(409, "max_versions", "Ya no podemos repetir más el dibujo de este libro. Escríbenos y lo miramos.");
    const both = await gateSpendCents(store, book.id, sheetAndCoverCents(adapter.name));
    if (!both.ok) return fail(402, "budget", both.reason);
    const made = await newSheetAndCover(store, book, d, sheets.length + 1);
    if (isFail(made)) return made;
    return { ok: true, bookId: book.public_id, sheetJobId: made.sheet.id, coverJobId: made.cover.id, created: 2, freeLeft: gate.freeLeft };
  });
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

export async function reviseSheet(
  store: GenStore,
  input: { bookId?: unknown; instruction?: unknown },
  adapter: Pick<GenerationAdapter, "name">,
  llm: Llm = selectLlm("art"),
  env: Env = process.env,
): Promise<StartResult | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  let { book, d } = loaded;
  if (await paidHere(store, book.id, env)) return paidFail();
  const instruction = typeof input.instruction === "string" ? input.instruction.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  if (!instruction) return fail(400, "instruction");
  const bad = blockedWord(instruction) ?? contactData(instruction);
  if (bad) return fail(422, "moderation", `Eso no lo podemos poner en un cuento infantil («${bad}»).`);
  if (!d.castArt || !book.email) return fail(409, "no_sheet");
  const existing = await store.listJobs(book.id);
  const sheets = sheetJobs(existing);
  if (sheets.length === 0) return fail(409, "no_sheet");
  if (sheetsLeftOf(sheets) <= 0) return fail(409, "max_versions", "Ya has usado los dos cambios de la hoja.");
  const gate = await freeGate(store, book.email, book, sheets);
  if ("error" in gate) return gate;
  const castNow = d.castArt;
  return afterGate(store, book, gate.claimed, async (): Promise<StartResult | Fail> => {
    const both = await gateSpendCents(store, book.id, sheetAndCoverCents(adapter.name));
    if (!both.ok) return fail(402, "budget", both.reason);

    const art = (await reviseCast(d.ficha, d.plan, castNow, instruction, llm)).art;
    ({ book, d } = await mutate(store, book, (cur) => ({ ...cur, castArt: art, pagesArt: undefined, approvedSheetJobId: undefined })));
    const made = await newSheetAndCover(store, book, d, sheets.length + 1);
    if (isFail(made)) return made;
    return { ok: true, bookId: book.public_id, sheetJobId: made.sheet.id, coverJobId: made.cover.id, created: 2 };
  });
}

/* ------------------------------ aprobar hoja, guardar textos ------------------------------ */

export async function approveSheet(store: GenStore, input: { bookId?: unknown; sheetJobId?: unknown }, env: Env = process.env): Promise<{ ok: true } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  const sheet = sheetJobs(await store.listJobs(book.id)).find((j) => j.id === input.sheetJobId);
  if (!sheet || sheet.status !== "done") return fail(409, "sheet_not_ready");
  // tras pagar, la misma hoja otra vez vale (el paso 4 la vuelve a aprobar al seguir); otra, no (I2)
  if (sheet.id !== d.approvedSheetJobId && (await paidHere(store, book.id, env))) return paidFail();
  await mutate(store, book, (cur) => ({ ...cur, approvedSheetJobId: sheet.id }));
  return { ok: true };
}

/** El libro impreso ya ha salido hacia la imprenta: no admite cambios. */
async function printLocked(store: GenStore, bookUuid: string): Promise<boolean> {
  const o = await store.getOrder(bookUuid);
  return !!o?.printStatus && LOCKED_PRINT_STATUSES.includes(o.printStatus);
}
const lockedFail = () => fail(409, "printed", "El libro ya está en la imprenta y no se puede cambiar.");

/** Lo que se pinta de una página (todo menos el texto). */
const sceneOf = (p: Plan["pages"][number] | undefined) => (p ? JSON.stringify([p.scene, p.who, p.extras, p.place, p.objects, p.outfit, p.shot, p.time]) : "");

/** Guarda el plan editado por el padre (textos, o una página reescrita). Las imágenes no se tocan aquí. */
export async function savePlan(store: GenStore, input: { bookId?: unknown; plan?: unknown }, env: Env = process.env): Promise<{ ok: true } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  const raw = planFromClient(d.ficha, input.plan);
  if (!raw) return fail(400, "plan");
  const plan = dropOrphanFamilyExtras(raw, d.ficha);
  if (await printLocked(store, book.id)) {
    // el guardado automático puede llegar después de mandarlo a imprimir con los mismos textos: eso no es un cambio
    const same = plan.title === d.plan.title && plan.dedication === d.plan.dedication && plan.pages.every((p, i) => p.text === d.plan.pages[i]?.text);
    return same ? { ok: true } : lockedFail();
  }
  // pagado: solo los textos; las escenas siguen como se pintaron (I2). Una escena nueva repintaba la página a nuestra costa.
  // Si llega un cuento con escenas distintas (otra pestaña, un cuento reescrito), no se injerta su texto en los dibujos
  // viejos: se dice (revisión 27 oct)
  const paid = await paidHere(store, book.id, env);
  if (paid && plan.pages.some((p, i) => sceneOf(p) !== sceneOf(d.plan.pages[i]))) return paidFail();
  const next = (cur: BookDraftV2): Plan =>
    paid
      ? { ...cur.plan, title: plan.title, dedication: plan.dedication, pages: cur.plan.pages.map((p, i) => ({ ...p, text: plan.pages[i]?.text ?? p.text })) }
      : // el reparto inventado y la portada no cambian después del email: la hoja ya está pintada con ellos
        { ...plan, extraCast: cur.plan.extraCast, cover: cur.plan.cover, places: cur.plan.places, objects: cur.plan.objects };
  const v = validatePlan(next(d), d.ficha, { fromParent: true });
  if (!v.usable) return fail(422, "plan_invalid", planProblem(v));
  await mutate(store, book, (cur) => ({ ...cur, plan: next(cur) }));
  return { ok: true };
}

/** El padre elige qué versión de una página va al libro. */
export async function choosePage(store: GenStore, input: { bookId?: unknown; jobId?: unknown }): Promise<{ ok: true } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book } = loaded;
  if (await printLocked(store, book.id)) return lockedFail();
  const job = (await store.listJobs(book.id)).find((j) => j.id === input.jobId && j.kind === "page" && v2Of(j));
  if (!job || job.status !== "done" || !job.page_n) return fail(409, "page_not_ready");
  const n = job.page_n;
  await mutate(store, book, (cur) => ({ ...cur, pageChoice: { ...(cur.pageChoice ?? {}), [n]: job.id } }));
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
    await store.extendBook(loaded.book.id, new Date(Date.now() + KEEP_AFTER_PAYMENT_MS).toISOString());
    return { ok: true };
  }
  const prep = await prepareCheckout(store, input);
  if (!prep.ok) return prep;
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  if (!(await store.hasPaidOrder(book.id))) await store.addPaidOrder(book.id, newOrder(prep.edition, prep.amountCents, `dry-run:${book.public_id}`, d.shipping));
  // como un pago real: el libro dura 30 días desde el pago (revisión 26 oct)
  await store.extendBook(book.id, new Date(Date.now() + KEEP_AFTER_PAYMENT_MS).toISOString());
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
  /** La dirección de la tapa dura con la que se abre este pago (`rememberCheckoutShipping`). */
  shipping?: Shipping;
}

/**
 * Antes de abrir el pago (real o de prueba): el libro existe y no está pagado, la edición es válida y, si es la tapa dura,
 * la dirección también. La edición y la dirección se guardan en el borrador y pasan al pedido cuando llega el pago.
 */
export async function prepareCheckout(store: GenStore, input: { bookId?: unknown; edition?: unknown; shipping?: unknown }, env: Env = process.env): Promise<CheckoutPrep | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  let { book, d } = loaded;
  if (await paidHere(store, book.id, env)) return fail(409, "already_paid");
  // no se paga con unos personajes todavía dibujándose: las páginas saldrían con la hoja anterior y, al terminar la nueva,
  // se repintaban todas (revisión 27 oct, I2)
  const sheets = sheetJobs(await store.listJobs(book.id));
  const drawing = (j: GenJob) => j.status === "pending" || (j.status === "running" && Date.now() - Date.parse(j.updated_at) < STALE_RUNNING_MS);
  // (solo cuenta la última: una anterior que se quedó en cola sin pintar no puede bloquear el pago)
  const last = sheets[sheets.length - 1];
  if (last && drawing(last) && sheets.some((j) => j.status === "done")) return fail(409, "sheet_not_ready", "Espera a que terminen de dibujarse los personajes y vuelve a intentarlo.");
  // sin personajes dibujados no se paga: las páginas no tendrían hoja de la que salir (menores de la auditoría 26 oct; la
  // pantalla no lleva aquí, pero un enlace con `pagado=1` sí). Los que se pagan quedan fijados: los aprobados o, si el
  // pago llega por otro camino sin aprobarlos, los últimos dibujados, que son los que se ven
  const done = sheets.filter((j) => j.status === "done");
  if (done.length === 0) return fail(409, "cast_not_ready", "Antes de pagar tienen que estar dibujados los personajes.");
  const cast = done.find((j) => j.id === d.approvedSheetJobId) ?? done[done.length - 1];
  const edition = paidEdition(input.edition) ?? "illustrated";
  let shipping: Shipping | undefined;
  if (edition === "hardcover") {
    const s = cleanShipping(input.shipping);
    if (!s.ok) return { ...fail(400, "shipping", s.message), field: s.field };
    shipping = s.shipping;
  }
  ({ book, d } = await mutate(store, book, (cur) => ({ ...cur, edition, approvedSheetJobId: cast.id, ...(shipping ? { shipping } : {}) })));
  return { ok: true, bookId: book.public_id, email: book.email, title: d.plan.title, edition, amountCents: PRICES[edition], ...(shipping ? { shipping } : {}) };
}

/** Cuántas sesiones de pago abiertas guardan su dirección (dos pestañas, un reintento): las más recientes. */
const CHECKOUT_SHIPPING_KEEP = 4;

/**
 * Abierta la sesión de pago de una tapa dura (la ruta, con el id que da Stripe), apunta con qué dirección se abrió: el
 * pedido llevará esa cuando llegue el pago de esa sesión. Si falla, el pedido usa la última dirección escrita, como antes.
 */
export async function rememberCheckoutShipping(store: GenStore, bookId: string, sessionId: string, shipping: Shipping): Promise<void> {
  const loaded = await loadBook(store, bookId);
  if (isFail(loaded)) return;
  await mutate(store, loaded.book, (cur) => ({
    ...cur,
    checkoutShipping: Object.fromEntries([...Object.entries(cur.checkoutShipping ?? {}).filter(([id]) => id !== sessionId), [sessionId, shipping]].slice(-CHECKOUT_SHIPPING_KEEP)),
  }));
}

/** Pagado: las direcciones de las sesiones abiertas ya no hacen falta (la buena va en el pedido). Si falla, las quita el borrado. */
async function forgetCheckoutShipping(store: GenStore, book: BookRecord): Promise<void> {
  await mutate(store, book, (cur) => {
    if (!cur.checkoutShipping) return cur;
    const next = { ...cur };
    delete next.checkoutShipping;
    return next;
  }).catch(() => null);
}

/** La dirección del pedido: la de la sesión que se paga; si no se apuntó, la última escrita (como antes). */
function shippingFor(d: BookDraftV2, sessionId: string | null | undefined): Shipping | undefined {
  return (sessionId ? d.checkoutShipping?.[sessionId] : undefined) ?? d.shipping;
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
  let { book, d } = loaded;
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
  ({ book, d } = await mutate(store, book, (cur) => ({ ...cur, shipping: s.shipping })));
  return { ok: true, bookId: book.public_id, email: book.email, title: d.plan.title, edition: "hardcover", amountCents, upgrade: true, shipping: s.shipping };
}

/**
 * La dirección entera de la tapa dura, solo cuando el padre la pide con un gesto: «Cambiar» (para no tener que escribirla
 * otra vez ni perder el piso o el teléfono) y la confirmación antes de imprimir (para ver la calle que va a la imprenta).
 * La vista, que se carga cada vez que se abre el enlace, lleva solo el resumen (I16; revisión 27 oct). Una vez en la
 * imprenta ya no se da: no hay nada que cambiar.
 */
export async function shippingOf(store: GenStore, input: { bookId?: unknown }): Promise<{ ok: true; shipping: Shipping } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  const order = await store.getOrder(book.id);
  if (!order || order.edition !== "hardcover") return fail(409, "not_hardcover");
  if (order.printStatus && LOCKED_PRINT_STATUSES.includes(order.printStatus)) return lockedFail();
  const shipping = order.shipping ?? d.shipping;
  return shipping ? { ok: true, shipping } : fail(404, "no_shipping", "Falta la dirección de envío.");
}

/** Cambiar la dirección de la tapa dura ya pagada, mientras no haya salido hacia la imprenta. */
export async function updateShipping(store: GenStore, input: { bookId?: unknown; shipping?: unknown }): Promise<{ ok: true; shipping: ShippingSummary } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book } = loaded;
  const order = await store.getOrder(book.id);
  if (!order || order.edition !== "hardcover") return fail(409, "not_hardcover");
  if (order.printStatus && LOCKED_PRINT_STATUSES.includes(order.printStatus)) return lockedFail();
  const s = cleanShipping(input.shipping);
  if (!s.ok) return { ...fail(400, "shipping", s.message), field: s.field };
  await store.updateOrder(order.id, { shipping: s.shipping });
  await mutate(store, book, (cur) => ({ ...cur, shipping: s.shipping }));
  // de vuelta, solo el resumen: lo mismo que enseña la vista (I16)
  return { ok: true, shipping: shippingSummary(s.shipping) };
}

/* ------------------------------ pago con Stripe (webhook) ------------------------------ */

export interface PaidEvent {
  type: string;
  data: {
    object: {
      id?: string;
      payment_status?: string;
      amount_total?: number | null;
      currency?: string | null;
      metadata?: Record<string, string> | null;
      client_reference_id?: string | null;
      customer_email?: string | null;
      customer_details?: { email?: string | null } | null;
    };
  };
}

export type PaymentOutcome =
  | { action: "paid"; bookId: string; mismatch?: string }
  | { action: "upgraded"; bookId: string; mismatch?: string }
  /** La misma sesión otra vez (Stripe reintenta): nada que hacer. */
  | { action: "duplicate"; bookId: string }
  /** Otra sesión pagada para un libro ya pagado: cobro doble que hay que devolver (el webhook avisa). `already`: la
   * edición que ya estaba pagada. */
  | { action: "double_charge"; bookId: string; already?: PaidEdition }
  | { action: "ignored"; reason: string };

/** Importe o moneda distintos de lo esperado (no frena el pedido: el cliente ha pagado; el webhook avisa). */
function paymentMismatch(expectedCents: number | null, s: PaidEvent["data"]["object"]): string | undefined {
  const out: string[] = [];
  if (expectedCents !== null && typeof s.amount_total === "number" && s.amount_total !== expectedCents) out.push(`importe ${s.amount_total} c, se esperaban ${expectedCents} c`);
  if (typeof s.currency === "string" && s.currency.toLowerCase() !== "eur") out.push(`moneda ${s.currency}`);
  return out.length ? out.join("; ") : undefined;
}

/**
 * Bloqueo de los cobros de un libro (cuentos_locks): lo que dura como mucho y lo que espera el segundo cobro. Dura de
 * sobra para unas pocas consultas: si caducara con el primer cobro aún a medias, el segundo podría registrarse también.
 * Si una función muere con él, el siguiente cobro del libro responde 500 hasta que caduca y Stripe lo reintenta.
 */
const PAY_LOCK_MS = 120_000;
const PAY_LOCK_WAIT_MS = 5_000;

/**
 * Los cobros de un mismo libro se registran de uno en uno (revisión 27 oct). Dos pagos a la vez (dos pestañas, o dos
 * mejoras a tapa dura) veían los dos el libro sin pagar y dejaban dos pedidos sin aviso. Así el segundo ya ve el primero
 * y queda como cobro doble (o mejora sin registrar), con aviso a soporte para devolverlo. Si el bloqueo sigue ocupado,
 * lanza: el webhook responde 500 y Stripe reintenta.
 */
async function oneChargeAtATime<T>(store: GenStore, bookUuid: string, waitMs: number, run: () => Promise<T>): Promise<T> {
  const key = `pago:${bookUuid}`;
  const giveUp = Date.now() + waitMs;
  let holder = await store.lock(key, PAY_LOCK_MS);
  while (!holder && Date.now() < giveUp) {
    await new Promise((r) => setTimeout(r, 100 + Math.floor(Math.random() * 100)));
    holder = await store.lock(key, PAY_LOCK_MS);
  }
  if (!holder) throw new Error("pago_ocupado: se está registrando otro cobro del mismo libro");
  try {
    return await run();
  } finally {
    await store.unlock(key, holder).catch(() => null);
  }
}

/**
 * Registra el pedido de un `checkout.session.completed` (o `async_payment_succeeded`) ya verificado.
 * Idempotente: la misma sesión dos veces (Stripe reintenta) no crea otro pedido.
 * Auditoría 26 oct (B7 y B3): un libro caducado pero aún guardado se registra igual y se alarga; si la base falla, lanza
 * (el webhook responde 500 y Stripe reintenta); otra sesión pagada para el mismo libro es un cobro doble, no un
 * duplicado silencioso, también si llegan a la vez. El pago alarga el libro 30 días desde ese momento.
 */
export async function recordStripePayment(
  store: GenStore,
  event: PaidEvent,
  env: Record<string, string | undefined> = process.env,
  opts: { lockWaitMs?: number } = {},
): Promise<PaymentOutcome> {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return { action: "ignored", reason: event.type };
  const s = event.data?.object ?? {};
  if (s.payment_status !== "paid") return { action: "ignored", reason: `payment_status:${s.payment_status ?? "?"}` };
  const bookId = s.metadata?.bookId ?? s.client_reference_id ?? null;
  const loaded = await loadBook(store, bookId, { includeExpired: true });
  if (isFail(loaded)) return { action: "ignored", reason: `book:${loaded.error}` };
  return oneChargeAtATime(store, loaded.book.id, opts.lockWaitMs ?? PAY_LOCK_WAIT_MS, () => recordCharge(store, loaded, s, env));
}

async function recordCharge(
  store: GenStore,
  loaded: { book: BookRecord; d: BookDraftV2 },
  s: PaidEvent["data"]["object"],
  env: Record<string, string | undefined>,
): Promise<PaymentOutcome> {
  const publicId = loaded.book.public_id;
  // la misma sesión, en cualquier estado: si ya se devolvió, no es un cobro doble ni un pago nuevo (revisión 27 oct)
  const same = s.id ? await store.getOrderBySession(s.id) : null;
  if (same) {
    // Stripe reintenta si la vez anterior falló después de guardar el pedido (por ejemplo, al alargar el libro): se
    // vuelve a alargar, que nunca acorta (revisión 26 oct)
    if ((same.status ?? "paid") === "paid") await store.extendBook(loaded.book.id, new Date(Date.now() + KEEP_AFTER_PAYMENT_MS).toISOString());
    return { action: "duplicate", bookId: publicId };
  }
  if (s.metadata?.upgrade === "1") return recordUpgrade(store, loaded, s, env);
  if (await paidHere(store, loaded.book.id, env)) {
    const prev = await store.getOrder(loaded.book.id);
    return { action: "double_charge", bookId: publicId, ...(prev ? { already: prev.edition } : {}) };
  }
  const edition = paidEdition(s.metadata?.edition) ?? "illustrated";
  const amount = typeof s.amount_total === "number" ? s.amount_total : PRICES[edition];
  await store.addPaidOrder(loaded.book.id, newOrder(edition, amount, s.id ?? null, shippingFor(loaded.d, s.id)));
  await forgetCheckoutShipping(store, loaded.book);
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
  await store.addPaidOrder(book.id, newOrder("hardcover", amount, s.id ?? null, shippingFor(d, s.id)));
  await forgetCheckoutShipping(store, book);
  // 25 oct: pagada la tapa dura, el libro tiene que seguir ahí hasta «Mandar a imprimir», aunque faltara poco para que
  // caducara al pedir la mejora
  await store.extendBook(book.id, new Date(Date.now() + KEEP_AFTER_PAYMENT_MS).toISOString());
  await mutate(store, book, (cur) => ({ ...cur, edition: "hardcover" })).catch(() => null);
  const mismatch = paymentMismatch(expected, s);
  return { action: "upgraded", bookId: book.public_id, ...(mismatch ? { mismatch } : {}) };
}

/**
 * Aviso a soporte de un recibo que el correo rechaza (I28): la dirección del padre, para revisarla, y el libro por su
 * referencia, sin el enlace que lo abre (I30). Puro, para probarlo; lo manda el webhook.
 */
export function receiptNotice(to: string, reason: string, bookUuid: string | null, sessionId: string | null): { subject: string; text: string } {
  return {
    subject: "Recibo sin enviar",
    text: [
      `No se ha podido mandar el recibo de compra a ${to}: el servicio de correo lo rechaza (${reason}). Revisa la dirección y mándalo a mano.`,
      bookUuid ? bookLine(bookUuid) : `Sesión de Stripe: ${sessionId ?? "?"} (el libro va en sus metadatos)`,
    ].join("\n\n"),
  };
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
  // el libro, por la sesión (sus metadatos en Stripe, o su pedido): el id público abriría el libro (I30)
  const facts = `Sesión: ${s.id ?? "?"} (el libro va en sus metadatos de Stripe)\nImporte: ${typeof s.amount_total === "number" ? (s.amount_total / 100).toFixed(2) : "?"} ${(s.currency ?? "eur").toUpperCase()}`;
  if (r.action === "ignored" && paidSession) {
    return {
      subject: upgrade ? "Mejora a tapa dura cobrada sin registrar" : "Cobro sin pedido",
      text: `Stripe cobró ${upgrade ? "una mejora a tapa dura" : "un libro"} que no se ha podido registrar (${r.reason}).\n${facts}\n\nRevísalo y devuélvelo desde el panel de Stripe si hace falta.`,
    };
  }
  if (r.action === "double_charge") {
    // con las dos ediciones: dos pestañas pueden pagar el PDF y la tapa dura a la vez, y gana el que llega antes
    const incoming = paidEdition(s.metadata?.edition);
    const what = (e: PaidEdition | null | undefined) => (e ? ` (${EDITION_LABEL[e]})` : "");
    const differ = !!r.already && !!incoming && r.already !== incoming;
    return {
      subject: "Cobro doble de un libro ya pagado",
      text: `El libro ya estaba pagado${what(r.already)} y ha llegado otro cobro de otra sesión de Stripe${what(incoming)}.\n${facts}\n\n${
        differ ? "Son ediciones distintas: pregunta al cliente cuál quiere antes de devolver nada." : "Devuelve este segundo cobro desde el panel de Stripe."
      }`,
    };
  }
  if ((r.action === "paid" || r.action === "upgraded") && r.mismatch) {
    return { subject: "Cobro con un importe que no cuadra", text: `El pedido se ha registrado, pero ${r.mismatch}.\n${facts}\n\nRevísalo en el panel de Stripe.` };
  }
  return null;
}

/**
 * Recibo de compra (I28): una vez por sesión de Stripe, cuando el webhook registra el pago o lo vuelve a ver porque Stripe
 * reintenta. Va al email con el que se pagó; si no viene, al del libro.
 *
 * El webhook lo espera antes de responder (revisión 27 oct: mandado después de responder, si fallaba no se reintentaba
 * nunca). `retry`: fallo pasajero (red, Resend caído); el webhook responde 500 y Stripe vuelve a mandar el evento.
 * `rejected`: Resend no lo acepta (dirección mal escrita, por ejemplo); reintentar no lo arregla y se avisa a soporte.
 * `skipped`: nada que mandar (ya mandado, sin correo configurado, pedido devuelto…).
 */
export type ReceiptResult = { status: "sent" | "skipped" | "retry" } | { status: "rejected"; to: string; reason: string };

export async function mailReceipt(
  store: GenStore,
  r: PaymentOutcome,
  event: PaidEvent,
  deps: {
    send: (to: string, receipt: Receipt) => Promise<{ sent: boolean; reason?: string }>;
    link: (publicId: string) => string;
    conditionsLink: string;
    seller: string;
    contact: string | null;
  },
): Promise<ReceiptResult> {
  const skipped = { status: "skipped" } as const;
  if (r.action !== "paid" && r.action !== "upgraded" && r.action !== "duplicate") return skipped;
  const s = event.data?.object ?? {};
  if (!s.id) return skipped;
  const order = await store.getOrderBySession(s.id);
  if (!order || (order.status ?? "paid") !== "paid") return skipped;
  const loaded = await loadBook(store, r.bookId, { includeExpired: true });
  if (isFail(loaded)) return skipped;
  const { book, d } = loaded;
  if (d.receiptSessions?.includes(s.id)) return skipped;
  const to = s.customer_details?.email ?? s.customer_email ?? book.email;
  if (!to) return skipped;
  const res = await deps
    .send(to, {
      title: d.plan.title,
      kind: s.metadata?.upgrade === "1" ? "upgrade" : order.edition,
      amountCents: order.amountCents,
      paidAt: order.createdAt,
      address: order.edition === "hardcover" && order.shipping ? shippingLine(order.shipping) : null,
      waiverAt: s.metadata?.withdrawal_waiver_at ?? null,
      link: deps.link(book.public_id),
      conditionsLink: deps.conditionsLink,
      seller: deps.seller,
      contact: deps.contact,
    })
    .catch(() => ({ sent: false, reason: "red" }));
  if (!res.sent) {
    const reason = res.reason ?? "";
    if (reason === "sin_configurar" || reason === "sin_destino") return skipped;
    const code = Number(/^resend_(\d+)$/.exec(reason)?.[1] ?? 0);
    if (code >= 400 && code < 500 && code !== 429) return { status: "rejected", to, reason };
    return { status: "retry" };
  }
  // mandado: si falla apuntarlo, mejor no reintentar (saldría dos veces)
  try {
    await mutate(store, book, (cur) => ({ ...cur, receiptSessions: [...(cur.receiptSessions ?? []), s.id!].slice(-5) }));
  } catch (e) {
    console.warn(`[stripe] recibo mandado sin apuntar: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
  }
  return { status: "sent" };
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
  await mutate(store, book, (cur) => ({ ...cur, readyMailedAt: Date.now() }));
  return true;
}

/** El job falló por el tope de coste del libro: no gasta intentos y otra vuelta solo vuelve a fallar. */
export const isBookCapError = (error: string | null | undefined): boolean => !!error?.includes("tope de coste por libro");

/**
 * Una imagen pagada que falló sin remedio (I3): agotó sus intentos con un fallo que no es pasajero, o chocó con el tope
 * de coste del libro. Los fallos pasajeros (429, 5xx, red) no cuentan: se reintentan solos.
 */
export function paidFailure(job: Pick<GenJob, "paid" | "status" | "attempts" | "error">): boolean {
  if (!job.paid || job.status !== "failed") return false;
  if (isBookCapError(job.error)) return true;
  return job.attempts >= MAX_ATTEMPTS && !job.error?.startsWith("pasajero");
}

/**
 * Lo que de verdad ya no va a salir solo (revisión 27 oct): una página o la portada del libro pagado sin ninguna versión
 * hecha ni en marcha, que ya no admite otra versión automática o que chocó con el tope del libro. Una versión 1 fallida
 * con hueco para otra no cuenta (la pide el siguiente `requestPages`), ni los retratos (si fallan, el libro usa la hoja).
 */
function stuckPaidImages(jobs: GenJob[], d: BookDraftV2): GenJob[] {
  const sheets = sheetJobs(jobs).filter((j) => j.status === "done");
  const sheet = sheets.find((j) => j.id === d.approvedSheetJobId) ?? sheets[sheets.length - 1];
  if (!sheet || !d.castArt) return [];
  const live = (j: GenJob) => j.status === "done" || j.status === "pending" || j.status === "running";
  const out: GenJob[] = [];
  for (let n = 1; n <= 12; n++) {
    const cur = currentPageJobs(jobs, d, n, sheet.id);
    if (cur.length === 0 || cur.some(live)) continue;
    const last = cur[cur.length - 1];
    const all = jobs.filter((j) => j.kind === "page" && j.page_n === n && v2Of(j));
    if (isBookCapError(last.error) || (paidFailure(last) && all.length >= MAX_PAGE_JOBS)) out.push(last);
  }
  const covers = coverJobs(jobs).filter((j) => sheetRefOf(j) === sheet.id);
  const lastCover = covers[covers.length - 1];
  if (lastCover?.paid && !covers.some(live) && (isBookCapError(lastCover.error) || (paidFailure(lastCover) && coverJobs(jobs).length >= DB_MAX_VARIANT))) out.push(lastCover);
  return out;
}

/**
 * Aviso a soporte cuando una imagen pagada no va a salir (I3; I12): con las páginas afectadas y el motivo. Cada job, una
 * vez: si después se atasca otra página, también avisa. Devuelve si lo ha mandado. `bookId`: el id público.
 */
export async function alertPaidFailures(
  store: GenStore,
  bookId: string,
  notify: (subject: string, text: string) => Promise<{ sent: boolean }>,
): Promise<boolean> {
  const book = await store.findBook({ publicId: bookId });
  const d = book ? draftV2(book) : null;
  if (!book || !d) return false;
  const told = new Set(d.failAlertedJobs ?? []);
  const stuck = stuckPaidImages(await store.listJobs(book.id), d).filter((j) => !told.has(j.id));
  if (stuck.length === 0) return false;
  const what = (j: GenJob) => (j.kind === "page" ? `página ${j.page_n}` : "portada");
  const r = await notify(
    `Imagen pagada que no sale: «${d.plan.title}»`,
    [
      `En el libro «${d.plan.title}» (${bookRef(book.id)}) ya no salen solas: ${stuck.map((j) => `${what(j)} (versión ${j.variant}: ${(j.error ?? "error").slice(0, 120)})`).join("; ")}.`,
      stuck.some((j) => isBookCapError(j.error))
        ? "Ha llegado al tope de coste por libro (MAX_COST_CENTS_PER_BOOK): hay que mirarlo a mano."
        : "Ya no quedan versiones automáticas. El padre puede avisarnos desde la página; hay que pintarla a mano.",
      bookLine(book.id),
    ].join("\n\n"),
  ).catch(() => ({ sent: false }));
  if (!r.sent) return false;
  await mutate(store, book, (cur) => ({ ...cur, failAlertedJobs: [...(cur.failAlertedJobs ?? []), ...stuck.map((j) => j.id)].slice(-40) }));
  return true;
}

/** Apunta que ya se avisó a soporte de este libro atascado (rescate, B4). */
export async function markStuckAlerted(store: GenStore, bookId: string, at: number): Promise<void> {
  const book = await store.findBook({ publicId: bookId });
  if (book && draftV2(book)) await mutate(store, book, (cur) => ({ ...cur, stuckAlertedAt: at }));
}

/**
 * «Otra versión» con motivo que ha pedido el padre en este libro (cuentos_feedback). Una por job: con la huella fija, dos
 * peticiones a la vez (doble clic) crean un solo job pero dos filas de motivo, y no pueden gastar dos (revisión 27 oct).
 */
function countRedos(feedback: { kind: string; job_id: string | null }[]): number {
  const rows = feedback.filter((f) => f.kind === "redo");
  return new Set(rows.map((f, i) => f.job_id ?? `sin-job-${i}`)).size;
}

async function redosUsed(store: GenStore, bookUuid: string): Promise<number> {
  return countRedos(await store.listFeedback(bookUuid));
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
    job_key: jobKey("page", n, variant, pageKey(d, page, sheetJobId)),
    style_id: style.id,
    prompt,
    references: [{ kind: "sheet", job_id: sheetJobId }, { kind: "anchor", style_id: style.id }, spec("3:2", "2K")] as unknown as NewJob["references"],
    paid: true,
  };
}

/**
 * Huella de una página (I1): su escena y su reparto (`pageArtKey`) y la hoja; la versión va aparte, en `jobKey`. No
 * lleva el prompt, que redacta el modelo y cambia en cada llamada: así dos peticiones a la vez (el webhook del pago y el
 * navegador, o dos pestañas) chocan en el índice único de (book_id, job_key) y la página no se pinta dos veces.
 */
function pageKey(d: BookDraftV2, page: BookDraftV2["plan"]["pages"][number], sheetJobId: string): string {
  return hashString(`${pageArtKey(d.castArt!, page)}|${sheetJobId}`);
}

/** Página `n` pintada con la escena actual (la última versión que coincide), si la hay. */
function currentPageJobs(jobs: GenJob[], d: BookDraftV2, n: number, sheetJobId: string): GenJob[] {
  const page = d.plan.pages[n - 1];
  const prefix = pageArtKey(d.castArt!, page);
  const fixed = pageKey(d, page, sheetJobId);
  // las pintadas antes del 27 oct llevan el prompt dentro de la huella: siguen valiendo
  const legacy = (j: GenJob) => j.job_key.endsWith(hashString(`${prefix}|${j.prompt}|${sheetJobId}`));
  return jobs.filter((j) => j.kind === "page" && j.page_n === n && v2Of(j) && sheetRefOf(j) === sheetJobId && (j.job_key.endsWith(fixed) || legacy(j)));
}

/** Cuánto espera una petición a la dirección de arte que ya está haciendo otra (tarda de 5 a 20 s). */
const PAGES_ART_WAIT_MS = 60_000;

/**
 * Dirección de arte de las páginas, una sola vez por libro (I1). La pide quien consigue poner la marca (`mutate` guarda
 * solo si nadie ha tocado el libro mientras); otra petición que llegue a la vez espera a esa. Si la otra falla o tarda
 * más de un minuto, la hace esta. Todas las páginas salen de la misma.
 */
async function pagesArtOnce(
  store: GenStore,
  book: BookRecord,
  d: BookDraftV2,
  llm: Llm,
  { sleep, now }: { sleep: (ms: number) => Promise<void>; now: () => number },
): Promise<{ book: BookRecord; d: BookDraftV2 }> {
  const key = pagesArtKey(d.castArt!, d.plan);
  for (let round = 0; round < 2; round++) {
    const st = { v: "mine" as "done" | "wait" | "mine", since: 0 };
    ({ book, d } = await mutate(store, book, (cur) => {
      if (cur.pagesArt?.key === key) return ((st.v = "done"), null);
      const p = cur.pagesArtPending;
      if (round === 0 && p?.key === key && now() - p.at < PAGES_ART_WAIT_MS) return ((st.v = "wait"), (st.since = p.at), null);
      st.v = "mine";
      return { ...cur, pagesArtPending: { key, at: now() } };
    }));
    if (st.v === "done") return { book, d };
    if (st.v === "mine") break;
    while (now() < st.since + PAGES_ART_WAIT_MS) {
      await sleep(2000);
      const again = await store.findBook({ publicId: book.public_id });
      const fd = again ? draftV2(again) : null;
      if (!again || !fd) throw new Error("books: not_found");
      ({ book, d } = { book: again, d: fd });
      if (d.pagesArt?.key === key) return { book, d };
      // la otra falló y quitó su marca: se hace aquí
      if (d.pagesArtPending?.key !== key) break;
    }
  }
  let art: PagesArt;
  try {
    art = (await pagesArt(d.ficha, d.plan, d.castArt!, llm)).art;
  } catch (e) {
    await mutate(store, book, (cur) => (cur.pagesArtPending?.key === key ? { ...cur, pagesArtPending: undefined } : null)).catch(() => null);
    throw e;
  }
  // sobre el borrador de ahora: lo que se haya guardado mientras (un texto corregido) no se pierde; si otra la terminó
  // antes, se queda la suya
  return mutate(store, book, (cur) => (cur.pagesArt?.key === key ? null : { ...cur, pagesArt: art, pagesArtPending: undefined }));
}

/* ------------------------------ tras el pago: la portada, si falta ------------------------------ */

/**
 * 26 oct: un libro pagado nunca se queda sin portada. Si la de su hoja falló (o no existe), se encarga otra como trabajo
 * pagado (sin tope por lead), como los retratos. Si algo falla aquí, se avisa en el log y el resto del libro sigue.
 */
async function ensureCover(store: GenStore, book: BookRecord, d: BookDraftV2, sheetJobId: string, adapter: Pick<GenerationAdapter, "name">, now = Date.now()): Promise<string[]> {
  try {
    const jobs = await store.listJobs(book.id);
    const mine = coverJobs(jobs).filter((j) => sheetRefOf(j) === sheetJobId);
    // una portada «pintando» desde hace más de 330 s está colgada (Vercel cortó la función): cuenta como perdida (B8)
    const hung = (j: GenJob) => j.status === "running" && now - Date.parse(j.updated_at) > STALE_RUNNING_MS;
    // una portada gratis que se quedó en cola tampoco vale: tras el pago solo se pintan las pagadas (revisión 26 oct)
    const alive = (j: GenJob) => j.status === "done" || (j.status === "running" && !hung(j)) || (j.status === "pending" && j.paid);
    if (mine.some(alive)) return [];
    // pagada y con intentos: runJob la vuelve a reclamar
    const resume = mine.find((j) => hung(j) && j.paid && j.attempts < MAX_ATTEMPTS);
    if (resume) return [resume.id];
    for (const j of mine.filter(hung)) await store.updateJob(j.id, { status: "failed", error: "tiempo agotado" });
    // con el tope del libro alcanzado, otra vuelta solo vuelve a fallar (y no gasta intentos): se queda así y avisa (I3)
    if (mine.some((j) => j.status === "failed" && isBookCapError(j.error))) return [];
    const retry = mine.find((j) => j.status === "failed" && j.attempts < MAX_ATTEMPTS && j.paid);
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
      if (cur.some((j) => isBookCapError(j.error))) continue;
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
  {
    dryRunPayment,
    env = process.env,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    now = Date.now,
  }: { dryRunPayment: boolean; env?: Env; sleep?: (ms: number) => Promise<void>; now?: () => number },
  llm: Llm = selectLlm("art"),
): Promise<{ ok: true; bookId: string; jobs: string[]; created: number } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  let { book, d } = loaded;
  if (!(await paidHere(store, book.id, env)) && !dryRunPayment) return fail(402, "not_paid");
  if (await printLocked(store, book.id)) return lockedFail();
  if (!d.castArt) return fail(409, "no_sheet");
  let jobs = await store.listJobs(book.id);
  const sheets = sheetJobs(jobs).filter((j) => j.status === "done");
  // la hoja de las páginas ya pagadas manda; si no, la aprobada; si no, la última (revisión 27 oct, I2)
  const paidSheetId = jobs.filter((j) => j.kind === "page" && j.paid && v2Of(j)).map(sheetRefOf).find(Boolean);
  const sheet = sheets.find((j) => j.id === paidSheetId) ?? sheets.find((j) => j.id === d.approvedSheetJobId) ?? sheets[sheets.length - 1];
  if (!sheet) return fail(409, "sheet_not_ready");
  // se fija como aprobada: la vista y las peticiones siguientes usan la misma, aunque después termine otra
  if (d.approvedSheetJobId !== sheet.id) ({ book, d } = await mutate(store, book, (cur) => ({ ...cur, approvedSheetJobId: sheet.id })));

  if (pagesArtKey(d.castArt!, d.plan) !== d.pagesArt?.key) {
    ({ book, d } = await pagesArtOnce(store, book, d, llm, { sleep, now }));
    // la dirección de arte tarda: lo que otra petición haya encolado mientras se ve aquí
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
    // las «Otra versión» se cuentan por sus motivos, no por versiones: una página repintada por otra causa no gasta
    // las del padre (I2)
    const redos = await redosUsed(store, book.id);
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
      // tope del libro: reabrirla en cada recarga solo vuelve a fallar y esconde «Avísanos» (I3)
      if (cur.some((j) => isBookCapError(j.error))) continue;
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
    `Página ${n} del libro «${d.plan.title}» (${bookRef(book.id)}).`,
    note ? `Lo que dice: «${note}»` : "No ha escrito nada más.",
    redos.length ? `Versiones que pidió antes:\n${redos.join("\n")}` : "No pidió otras versiones con motivo.",
    `Escena: ${d.plan.pages[n - 1]?.scene ?? ""}`,
    bookLine(book.id),
  ].join("\n\n");
  // si no ha salido ninguna versión, el asunto lo dice (I3: «Avísanos» también sin ninguna hecha)
  const anyDone = (await store.listJobs(book.id)).some((j) => j.kind === "page" && j.page_n === n && j.status === "done");
  const sent = await notify(`${anyDone ? "Sigue sin estar bien" : "No sale"}: página ${n} de «${d.plan.title}»`, text);
  if (!sent.sent) console.warn(`[report] aviso sin enviar (${bookRef(book.id)}, página ${n})`);
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
  /**
   * Por qué falló: «budget», el tope del día (mañana se puede); «limit», el tope del libro (no se renueva); «error», lo
   * demás (revisión 26 oct: antes todo era «budget» y el paso 4 decía «vuelve mañana» también con el tope del libro).
   */
  error: "budget" | "limit" | "error" | null;
  /** Sigue siendo la imagen de la escena actual (si el padre cambió la página después, ya no). */
  current: boolean;
  sheetJobId: string | null;
  /** Encargada tras el pago (las páginas, los retratos y una portada que faltaba). */
  paid: boolean;
}

/**
 * Ilustraciones del libro que están pintadas pero llegan sin URL, porque falló la firma de Storage (auditoría 26 oct, I8):
 * el PDF saldría con ese hueco, y el de la imprenta ya no tiene vuelta atrás. Cuentan la portada, las 12 páginas y la
 * página de personajes: un retrato sin URL (la maqueta pasaría a la hoja sin avisar) y la hoja, cuando es la que se usa
 * (revisión 27 oct). Las del modo sin coste no tienen imagen y no cuentan, salvo con `placeholders` (un pedido real a la
 * imprenta: saldrían en blanco).
 */
export function unsignedImages(view: Pick<BookView, "jobs" | "chosen">, { placeholders = false }: { placeholders?: boolean } = {}): string[] {
  const byId = new Map(view.jobs.map((j) => [j.id, j]));
  const gap = (id: string | null) => {
    const j = id ? byId.get(id) : undefined;
    return !!j && j.status === "done" && !j.url && (placeholders || !j.placeholder);
  };
  const out: string[] = [];
  if (gap(view.chosen.cover)) out.push("portada");
  const portraits = view.chosen.portraits;
  for (const p of portraits) if (gap(p.job)) out.push(`retrato de ${p.name}`);
  // sin todos los retratos, la página de personajes es la hoja
  const allPortraits = portraits.length > 0 && portraits.every((p) => !!p.job && !!byId.get(p.job)?.url);
  if (!allPortraits && gap(view.chosen.sheet)) out.push("hoja de personajes");
  for (let n = 1; n <= 12; n++) if (gap(view.chosen.pages[n] ?? null)) out.push(`página ${n}`);
  return out;
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

function failReason(error: string | null | undefined): BookJobView["error"] {
  if (error?.includes("tope diario")) return "budget";
  if (error?.includes("tope por lead") || error?.includes("tope de coste por libro")) return "limit";
  return "error";
}

/** `sign: false`: sin firmar las URL de las imágenes (todas null), para quien solo necesita qué va en el libro (el PDF, I10). */
export async function bookView(store: GenStore, bookId: unknown, env: Env = process.env, { sign = true }: { sign?: boolean } = {}): Promise<BookView | Fail> {
  const loaded = await loadBook(store, bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  const jobs = (await store.listJobs(book.id)).filter((j) => v2Of(j));
  const sheets = sheetJobs(jobs);
  const paid = await paidHere(store, book.id, env);
  // sin pago (o devuelto, I5), las ilustraciones de pago no se enseñan: solo la hoja, la portada y lo gratis (revisión 27 oct)
  const shown = (j: GenJob) => j.status === "done" && !!j.storage_path && !(j.paid && !paid);
  // todas en una llamada, y la misma URL que la consulta anterior mientras siga valiendo (I20)
  const urls = sign ? await store.signedUrls(jobs.filter(shown).map((j) => j.storage_path!), VIEW_URL_SECONDS) : new Map<string, string>();
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
      url: shown(j) ? urls.get(j.storage_path!) ?? null : null,
      placeholder: j.status === "done" && !j.storage_path,
      error: j.status === "failed" ? failReason(j.error) : null,
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
    redosLeft: Math.max(0, MAX_BOOK_REDOS - countRedos(feedback)),
    reported: [...new Set(feedback.filter((f) => f.kind === "report").map((f) => f.page_n))],
    ficha: d.ficha,
    plan: d.plan,
    paid,
    edition: order?.edition ?? null,
    upgrade: upgradeOffer(book, order ?? null, Date.now(), env),
    print:
      order?.edition === "hardcover" && order.printStatus
        ? {
            status: order.printStatus,
            // ni la calle ni el teléfono: el enlace del libro se reenvía (I16)
            shipping: order.shipping || d.shipping ? shippingSummary((order.shipping ?? d.shipping)!) : null,
            trackingUrl: order.trackingUrl,
            sentAt: order.sentAt,
            trackPath: order.sentAt ? `/seguimiento/${order.id}` : null,
          }
        : null,
    approvedSheetJobId: d.approvedSheetJobId ?? null,
    sheetsLeft: sheetsLeftOf(sheets),
    jobs: out,
    chosen: { sheet: sheet?.id ?? null, cover: cover?.id ?? null, pages, portraits },
    portraitsToRequest,
  };
}

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
import { canSpend } from "../generation/budget";
import { castArt, castArtKey, coverPrompt, pageArtKey, pagePrompt, pagesArt, pagesArtKey, reviseCast, sheetPrompt, type CastArt, type PagesArt } from "../plan/art";
import { fichaHash, normalizeFicha } from "../plan/ficha";
import { blockedWord, contactData } from "../plan/moderation";
import { planFromClient } from "../plan/planner";
import { validatePlan } from "../plan/validate";
import type { Ficha, Plan } from "../plan/types";

export const MAX_SHEETS = 3; // la primera + 2 cambios con palabras
export const MAX_PAGE_JOBS = 3; // la incluida + 1 versión más + 1 por si el padre cambia la escena
export const PRICE_CENTS = 1490;

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

async function loadBook(store: GenStore, bookId: unknown): Promise<{ book: BookRecord; d: BookDraftV2 } | Fail> {
  const id = typeof bookId === "string" && /^[a-z0-9]{8,16}$/.test(bookId) ? bookId : null;
  if (!id) return fail(400, "book_id");
  const book = await store.findBook({ publicId: id });
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
  email?: string;
  title?: string;
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

  // hoja + portada tienen que caber juntas en el tope del lead y del día
  const both = await gateSpendCents(store, email, sheetAndCoverCents(adapter.name));
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
  return { ok: true, bookId: book.public_id, sheetJobId: sheet.id, coverJobId: cover.id, created: 2, fresh: variant === 1, email, title: plan.title };
}

/** Comprueba que `cents` caben en el tope del lead y del día. */
async function gateSpendCents(store: GenStore, leadId: string, cents: number): Promise<{ ok: boolean; reason?: string }> {
  if (cents <= 0) return { ok: true };
  return canSpend(store.db, { leadId, cents });
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
  const both = await gateSpendCents(store, book.email, sheetAndCoverCents(adapter.name));
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

/** Guarda el plan editado por el padre (textos, o una página reescrita). Las imágenes no se tocan aquí. */
export async function savePlan(store: GenStore, input: { bookId?: unknown; plan?: unknown }): Promise<{ ok: true } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  const plan = planFromClient(d.ficha, input.plan);
  if (!plan) return fail(400, "plan");
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
  const job = (await store.listJobs(book.id)).find((j) => j.id === input.jobId && j.kind === "page" && v2Of(j));
  if (!job || job.status !== "done" || !job.page_n) return fail(409, "page_not_ready");
  d.pageChoice = { ...(d.pageChoice ?? {}), [job.page_n]: job.id };
  await save(store, book, d);
  return { ok: true };
}

/* ------------------------------ pago simulado ------------------------------ */

export async function payDryRun(store: GenStore, input: { bookId?: unknown }): Promise<{ ok: true } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  if (!(await store.hasPaidOrder(loaded.book.id))) await store.addPaidOrder(loaded.book.id, { amountCents: PRICE_CENTS, edition: "illustrated", sessionId: `dry-run:${loaded.book.public_id}` });
  return { ok: true };
}

/* ------------------------------ pago con Stripe (webhook) ------------------------------ */

export interface PaidEvent {
  type: string;
  data: { object: { id?: string; payment_status?: string; amount_total?: number | null; metadata?: Record<string, string> | null; client_reference_id?: string | null } };
}

export type PaymentOutcome =
  | { action: "paid"; bookId: string }
  | { action: "duplicate"; bookId: string }
  | { action: "ignored"; reason: string };

/**
 * Registra el pedido de un `checkout.session.completed` (o `async_payment_succeeded`) ya verificado.
 * Idempotente: la misma sesión dos veces (Stripe reintenta) no crea otro pedido.
 */
export async function recordStripePayment(store: GenStore, event: PaidEvent): Promise<PaymentOutcome> {
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") return { action: "ignored", reason: event.type };
  const s = event.data?.object ?? {};
  if (s.payment_status !== "paid") return { action: "ignored", reason: `payment_status:${s.payment_status ?? "?"}` };
  const bookId = s.metadata?.bookId ?? s.client_reference_id ?? null;
  const loaded = await loadBook(store, bookId);
  if (isFail(loaded)) return { action: "ignored", reason: `book:${loaded.error}` };
  if (await store.hasPaidOrder(loaded.book.id)) return { action: "duplicate", bookId: loaded.book.public_id };
  await store.addPaidOrder(loaded.book.id, { amountCents: typeof s.amount_total === "number" ? s.amount_total : PRICE_CENTS, edition: "illustrated", sessionId: s.id ?? null });
  return { action: "paid", bookId: loaded.book.public_id };
}

/** Datos para el pago: el libro existe, tiene email y aún no está pagado. */
export async function checkoutInfo(store: GenStore, bookId: unknown): Promise<{ ok: true; bookId: string; email: string | null; title: string } | Fail> {
  const loaded = await loadBook(store, bookId);
  if (isFail(loaded)) return loaded;
  if (await store.hasPaidOrder(loaded.book.id)) return fail(409, "already_paid");
  return { ok: true, bookId: loaded.book.public_id, email: loaded.book.email, title: loaded.d.plan.title };
}

/**
 * Cuando las 12 páginas están pintadas, manda una vez el email de «tu libro está listo» (el envío se inyecta: Resend en
 * la ruta, un doble en los tests). Devuelve si lo ha mandado.
 */
export async function notifyBookReady(store: GenStore, bookId: string, link: (id: string) => string, send: (to: string, title: string, link: string) => Promise<{ sent: boolean }>): Promise<boolean> {
  const loaded = await loadBook(store, bookId);
  if (isFail(loaded)) return false;
  const { book, d } = loaded;
  if (d.readyMailedAt || !book.email) return false;
  const view = await bookView(store, bookId);
  if (!view.ok || !view.paid || !Object.values(view.chosen.pages).every(Boolean)) return false;
  const r = await send(book.email, d.plan.title, link(book.public_id));
  if (!r.sent) return false;
  const fresh = draftV2((await store.findBook({ publicId: bookId })) ?? book) ?? d;
  await save(store, book, { ...fresh, readyMailedAt: Date.now() });
  return true;
}

/** Ids de las páginas que esperan a pintarse (para el segundo plano). */
export async function pendingPageJobs(store: GenStore, bookId: string): Promise<string[]> {
  const book = await store.findBook({ publicId: bookId });
  if (!book) return [];
  return (await store.listJobs(book.id)).filter((j) => j.kind === "page" && v2Of(j) && j.status === "pending").sort((a, b) => (a.page_n ?? 0) - (b.page_n ?? 0)).map((j) => j.id);
}

/* ------------------------------ tras el pago: páginas ------------------------------ */

function pageRow(book: BookRecord, d: BookDraftV2, n: number, variant: number, sheetJobId: string): NewJob {
  const style = getStyle(d.ficha.styleId)!;
  const page = d.plan.pages[n - 1];
  const ap = d.pagesArt!.pages.find((p) => p.n === n)!;
  const prompt = pagePrompt(d.castArt!, page, ap, style);
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

export async function requestPages(
  store: GenStore,
  input: { bookId?: unknown; page?: unknown },
  adapter: Pick<GenerationAdapter, "name">,
  { dryRunPayment }: { dryRunPayment: boolean },
  llm: Llm = selectLlm("art"),
): Promise<{ ok: true; bookId: string; jobs: string[]; created: number } | Fail> {
  const loaded = await loadBook(store, input.bookId);
  if (isFail(loaded)) return loaded;
  let { book } = loaded;
  const { d } = loaded;
  if (!(await store.hasPaidOrder(book.id)) && !dryRunPayment) return fail(402, "not_paid");
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
  if (input.page !== undefined) {
    const n = Number(input.page);
    if (!Number.isInteger(n) || n < 1 || n > 12) return fail(400, "page");
    const all = jobs.filter((j) => j.kind === "page" && j.page_n === n && v2Of(j));
    if (all.length >= MAX_PAGE_JOBS) return fail(409, "max_versions", "Esta página ya no admite más versiones.");
    wanted.push(pageRow(book, d, n, all.length + 1, sheet.id));
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
  return { ok: true, bookId: book.public_id, jobs: [...after.filter((j) => keys.has(j.job_key)).map((j) => j.id), ...reopenedIds], created: wanted.length };
}


/* ------------------------------ estado ------------------------------ */

export interface BookJobView {
  id: string;
  kind: "sheet" | "cover" | "page";
  page: number | null;
  variant: number;
  status: GenJob["status"];
  url: string | null;
  placeholder: boolean;
  error: "budget" | "error" | null;
  /** Sigue siendo la imagen de la escena actual (si el padre cambió la página después, ya no). */
  current: boolean;
  sheetJobId: string | null;
}

export interface BookView {
  ok: true;
  bookId: string;
  ficha: Ficha;
  plan: Plan;
  paid: boolean;
  approvedSheetJobId: string | null;
  sheetsLeft: number;
  jobs: BookJobView[];
  /** Lo que va al libro: portada de la hoja aprobada (o la última) y la versión elegida de cada página. */
  chosen: { sheet: string | null; cover: string | null; pages: Record<number, string | null> };
  /** Los pone la ruta /api/libro/view: cómo se paga aquí, si se mandan emails y si se pinta en segundo plano. */
  payment?: "stripe" | "dry-run" | "none";
  mail?: boolean;
  background?: boolean;
}

export async function bookView(store: GenStore, bookId: unknown): Promise<BookView | Fail> {
  const loaded = await loadBook(store, bookId);
  if (isFail(loaded)) return loaded;
  const { book, d } = loaded;
  const jobs = (await store.listJobs(book.id)).filter((j) => v2Of(j));
  const sheets = sheetJobs(jobs);
  const out: BookJobView[] = [];
  for (const j of jobs) {
    const sheetId = sheetRefOf(j);
    const current = j.kind === "page" && d.castArt && d.pagesArt && sheetId ? currentPageJobs([j], d, j.page_n!, sheetId).length > 0 : true;
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
  return {
    ok: true,
    bookId: book.public_id,
    ficha: d.ficha,
    plan: d.plan,
    paid: await store.hasPaidOrder(book.id),
    approvedSheetJobId: d.approvedSheetJobId ?? null,
    sheetsLeft: Math.max(0, MAX_SHEETS - sheets.length),
    jobs: out,
    chosen: { sheet: sheet?.id ?? null, cover: cover?.id ?? null, pages },
  };
}

/**
 * Generación sin worker externo (B3): lógica de /api/generate/{sample,book,run,status}. Las rutas solo validan la
 * petición y llaman aquí; scripts/worker.ts usa runJob como alternativa (docs/GENERATION.md).
 *
 * Reglas:
 * - Nada se genera dos veces: cada job lleva una huella (`job_key`, lib/generation/keys.ts) única por libro.
 * - Antes del pago: hoja + página 9 por lead (= email), con canSpend (tope por lead y diario). «Otra versión de la
 *   hoja» hasta MAX_SHEET_VERSIONS, cada una cuenta en el presupuesto del lead.
 * - Tras el pago: las páginas que faltan + portada, `paid: true` (salta el tope por lead; el diario solo si el pago es
 *   de Stripe y no de prueba) y tope
 *   por libro (MAX_COST_CENTS_PER_BOOK).
 * - runJob procesa UN job: reclama con bloqueo optimista, llama al adaptador, sube el PNG, anota coste y gasto.
 */
import { newPublicId } from "../ids";
import { buildBook, normalizeDraft } from "../story";
import { characterBible } from "./character";
import { estimatedCostCents, isTimeout, isTransient, type GenerationAdapter, type GenerationResult, type ImageRef, type ImageSize } from "./adapter";
import { thumbnail, toJpeg } from "./postprocess";
import { qcImage, type QcResult } from "../plan/qc";
import { canSpend, freeBookCapCents, recordSpend, type SpendCheck, type SpendKind } from "./budget";
import {
  MAX_PAGE_VERSIONS,
  MAX_SHEET_VERSIONS,
  SAMPLE_PAGE,
  coverJobKey,
  coverScenePrompt,
  jobKey,
  pageJobKey,
  sampleKey,
  sheetJobKey,
  type JobKind,
} from "./keys";
import { getStyle } from "./styles";
import type { BookRecord, GenJob, GenStore, NewJob } from "./store";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import type { Draft, StyleId } from "../types";

export const MAX_ATTEMPTS = 2;
/**
 * Un job `running` sin cambios en este tiempo se da por perdido (función cortada) y se puede reclamar. La ruta de
 * ejecución tiene maxDuration 300 s; con margen para no pintar dos veces la misma imagen.
 */
export const STALE_RUNNING_MS = 330_000;

export type Fail = { ok: false; status: number; error: string; reason?: string; /** Campo del formulario que falla (la dirección). */ field?: string };

function fail(status: number, error: string, reason?: string): Fail {
  return { ok: false, status, error, ...(reason ? { reason } : {}) };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  return EMAIL_RE.test(e) && e.length <= 200 ? e : null;
}

/* ------------------------------ presupuesto ------------------------------ */

/**
 * ¿Se pueden pintar `images` imágenes más para este lead? Con dry-run (coste 0) siempre; si no, canSpend con el coste
 * estimado (tope por lead salvo `paid`, y tope diario).
 */
export async function gateSpend(
  db: SupabaseClient<Database> | null,
  { leadId, images, provider, paid = false, now, size, leadCap }: { leadId: string; images: number; provider: string; paid?: boolean; now?: Date; size?: ImageSize; leadCap?: number },
): Promise<SpendCheck & { cents: number }> {
  const cents = images * estimatedCostCents(provider, size);
  if (cents === 0) return { ok: true, cents };
  return { ...(await canSpend(db, { leadId, cents, paid, now, leadCap })), cents };
}

/* ------------------------------ libro ------------------------------ */

/** Localiza el libro: Supabase por public_id (o el último del email); en memoria lo crea con el borrador del cliente. */
async function resolveBook(
  store: GenStore,
  input: { bookId?: string; email?: string | null; draft?: unknown },
): Promise<BookRecord | Fail> {
  const bookId = typeof input.bookId === "string" && /^[a-z0-9]{8,16}$/.test(input.bookId) ? input.bookId : undefined;
  if (store.mode === "memory") {
    if (!input.draft || typeof input.draft !== "object" || JSON.stringify(input.draft).length > 60_000) return fail(400, "draft");
    const publicId = bookId ?? newPublicId();
    return store.saveMemoryBook!({ publicId, email: input.email ?? null, draft: normalizeDraft(input.draft as Partial<Draft>) });
  }
  // solo por id: buscar por email daba el enlace del libro de otra familia a quien supiera su email (auditoría 26 oct, B5)
  if (!bookId) return fail(400, "book_id");
  const book = await store.findBook({ publicId: bookId });
  return book ?? fail(404, "not_found");
}

function isFail(v: unknown): v is Fail {
  return !!v && typeof v === "object" && (v as Fail).ok === false;
}

const KIND_ORDER: Record<JobKind, number> = { sheet: 0, sample: 1, page: 2, cover: 3, portrait: 4 };

/** Orden de ejecución: hojas, muestra, páginas por número y versión, portada. */
export function sortJobs<T extends Pick<GenJob, "kind" | "page_n" | "variant" | "created_at">>(jobs: T[]): T[] {
  return [...jobs].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.page_n ?? 0) - (b.page_n ?? 0) || a.variant - b.variant || a.created_at.localeCompare(b.created_at),
  );
}

/** Jobs de la hoja con la huella actual, por versión. */
function sheetJobsFor(jobs: GenJob[], key: string): GenJob[] {
  return jobs.filter((j) => j.kind === "sheet" && j.job_key.endsWith(`:${key}`)).sort((a, b) => a.variant - b.variant);
}

/* ------------------------------ muestra ------------------------------ */

export interface SampleInput {
  bookId?: string;
  email?: unknown;
  styleId?: unknown;
  draft?: unknown;
  /** Pide otra versión de la hoja (máximo MAX_SHEET_VERSIONS en total). */
  sheetVersion?: boolean;
}

export interface SampleResult {
  ok: true;
  bookId: string;
  sheetJobId: string;
  sampleJobId: string;
  sampleKey: string;
  sheetVersions: number;
  created: number;
}

export async function requestSample(store: GenStore, input: SampleInput, adapter: Pick<GenerationAdapter, "name">): Promise<SampleResult | Fail> {
  const style = getStyle(typeof input.styleId === "string" ? input.styleId : "");
  if (!style) return fail(400, "style_id");
  const email = cleanEmail(input.email);
  const book = await resolveBook(store, { bookId: input.bookId, email, draft: input.draft });
  if (isFail(book)) return book;
  const lead = book.email ?? email;
  if (!lead) return fail(400, "email");

  const draft = book.draft;
  const styleId = style.id as StyleId;
  const built = buildBook(draft);
  const sheetK = sheetJobKey(draft, styleId);
  const sampleK = sampleKey(draft, styleId, built);
  const page = built.pages.find((p) => p.n === SAMPLE_PAGE)!;
  const existing = await store.listJobs(book.id);
  const sheets = sheetJobsFor(existing, sheetK);

  const sheetsWanted: NewJob[] = [];
  const sheetRow = (variant: number): NewJob => ({
    book_id: book.id,
    kind: "sheet",
    page_n: null,
    variant,
    job_key: jobKey("sheet", 0, variant, sheetK),
    style_id: styleId,
    prompt: characterBible(draft.hero.traits, draft.hero.age),
    references: [{ kind: "anchor", style_id: styleId }],
    paid: false,
  });
  const sampleJobKey = jobKey("sample", SAMPLE_PAGE, 1, sampleK);
  const wantsSample = !input.sheetVersion && !existing.some((j) => j.job_key === sampleJobKey);
  if (input.sheetVersion) {
    if (sheets.length === 0) return fail(409, "no_sheet");
    if (sheets.length >= MAX_SHEET_VERSIONS) return fail(409, "max_versions");
    sheetsWanted.push(sheetRow(sheets.length + 1));
  } else if (sheets.length === 0) sheetsWanted.push(sheetRow(1));
  // un fallo previo con intentos libres se reabre (cuenta como gasto nuevo)
  const retry = input.sheetVersion
    ? []
    : existing.filter((j) => (j.job_key === sampleJobKey || j === sheets[0]) && j.status === "failed" && j.attempts < MAX_ATTEMPTS);

  const images = sheetsWanted.length + (wantsSample ? 1 : 0) + retry.length;
  if (images > 0) {
    const gate = await gateSpend(store.db, { leadId: lead, images, provider: adapter.name });
    if (!gate.ok) return fail(402, "budget", gate.reason);
  }
  // primero la hoja: la muestra la lleva como referencia (su id)
  await store.insertJobs(sheetsWanted);
  let afterSheets = sheetJobsFor(await store.listJobs(book.id), sheetK);
  if (wantsSample) {
    await store.insertJobs([
      {
        book_id: book.id,
        kind: "sample",
        page_n: SAMPLE_PAGE,
        variant: 1,
        job_key: sampleJobKey,
        style_id: styleId,
        prompt: page.scenePrompt,
        references: [
          { kind: "sheet", job_id: afterSheets[0]?.id ?? null },
          { kind: "anchor", style_id: styleId },
        ],
        paid: false,
      },
    ]);
  }
  for (const j of retry) await store.reopen(j);

  const after = await store.listJobs(book.id);
  afterSheets = sheetJobsFor(after, sheetK);
  const sample = after.find((j) => j.job_key === sampleJobKey);
  const sheet = input.sheetVersion ? afterSheets[afterSheets.length - 1] : afterSheets[0];
  if (!sheet || !sample) return fail(500, "db");
  return {
    ok: true,
    bookId: book.public_id,
    sheetJobId: sheet.id,
    sampleJobId: sample.id,
    sampleKey: sampleK,
    sheetVersions: afterSheets.length,
    created: sheetsWanted.length + (wantsSample ? 1 : 0),
  };
}

/* ------------------------------ libro pagado ------------------------------ */

export interface BookInput {
  bookId?: string;
  email?: unknown;
  styleId?: unknown;
  draft?: unknown;
  /** Versión de la hoja elegida como referencia; si falta, la primera terminada. */
  sheetJobId?: unknown;
  /** Pide la otra versión de una página (máximo MAX_PAGE_VERSIONS por página). */
  page?: unknown;
}

export async function requestBook(
  store: GenStore,
  input: BookInput,
  adapter: Pick<GenerationAdapter, "name">,
  { dryRunPayment }: { dryRunPayment: boolean },
): Promise<{ ok: true; bookId: string; jobs: string[]; created: number } | Fail> {
  const style = getStyle(typeof input.styleId === "string" ? input.styleId : "");
  if (!style) return fail(400, "style_id");
  const book = await resolveBook(store, { bookId: input.bookId, email: cleanEmail(input.email), draft: input.draft });
  if (isFail(book)) return book;
  if (!dryRunPayment && !(await store.hasPaidOrder(book.id))) return fail(402, "not_paid");

  const draft = book.draft;
  const styleId = style.id as StyleId;
  const built = buildBook(draft);
  const existing = await store.listJobs(book.id);
  const sheets = sheetJobsFor(existing, sheetJobKey(draft, styleId)).filter((j) => j.status === "done");
  const sheet = sheets.find((j) => j.id === input.sheetJobId) ?? sheets[0];
  if (!sheet) return fail(409, "sheet_not_ready");
  const refs = [
    { kind: "sheet", job_id: sheet.id },
    { kind: "anchor", style_id: styleId },
  ];
  const has = (key: string) => existing.some((j) => j.job_key === key);
  const pageRow = (n: number, variant: number): NewJob => {
    const p = built.pages.find((x) => x.n === n)!;
    return {
      book_id: book.id,
      kind: "page",
      page_n: n,
      variant,
      job_key: jobKey("page", n, variant, pageJobKey(draft, styleId, p)),
      style_id: styleId,
      prompt: p.scenePrompt,
      references: refs,
      paid: true,
    };
  };

  const wanted: NewJob[] = [];
  let retry: GenJob[] = [];
  if (input.page !== undefined) {
    const n = Number(input.page);
    if (!Number.isInteger(n) || n < 1 || n > 12) return fail(400, "page");
    const p = built.pages.find((x) => x.n === n)!;
    const key = pageJobKey(draft, styleId, p);
    const versions = existing.filter((j) => j.page_n === n && (j.kind === "page" || j.kind === "sample") && j.job_key.endsWith(`:${key}`)).length;
    if (versions === 0) return fail(409, "page_not_ready");
    if (versions >= MAX_PAGE_VERSIONS) return fail(409, "max_versions");
    wanted.push(pageRow(n, versions + 1));
  } else {
    for (const p of built.pages) {
      const key = pageJobKey(draft, styleId, p);
      // la página 9 de la muestra vale si se pintó con la misma huella: no se repite
      if (p.n === SAMPLE_PAGE && has(jobKey("sample", SAMPLE_PAGE, 1, key))) continue;
      if (!has(jobKey("page", p.n, 1, key))) wanted.push(pageRow(p.n, 1));
    }
    const coverKey = jobKey("cover", 0, 1, coverJobKey(draft, styleId));
    if (!has(coverKey)) {
      wanted.push({ book_id: book.id, kind: "cover", page_n: null, variant: 1, job_key: coverKey, style_id: styleId, prompt: coverScenePrompt(draft), references: refs, paid: true });
    }
    // una página pagada que falló y tiene intentos libres se reabre al volver a pedir el libro
    const current = new Set([coverKey, ...built.pages.map((p) => jobKey("page", p.n, 1, pageJobKey(draft, styleId, p)))]);
    retry = existing.filter((j) => j.paid && j.status === "failed" && j.attempts < MAX_ATTEMPTS && current.has(j.job_key));
  }

  const images = wanted.length + retry.length;
  if (images > 0) {
    const gate = await gateSpend(store.db, { leadId: book.id, images, provider: adapter.name, paid: true });
    if (!gate.ok) return fail(429, "budget", gate.reason);
  }
  await store.insertJobs(wanted);
  for (const j of retry) await store.reopen(j);
  if (wanted.length > 0) await store.markIllustrating(book.id);
  const keys = new Set(wanted.map((w) => w.job_key));
  const after = await store.listJobs(book.id);
  return { ok: true, bookId: book.public_id, jobs: after.filter((j) => keys.has(j.job_key)).map((j) => j.id), created: wanted.length };
}

/* ------------------------------ ejecutar un job ------------------------------ */

const SPEND_KIND: Record<JobKind, SpendKind> = { sheet: "sheet", sample: "sample", page: "page", cover: "page", portrait: "page" };

export function storagePath(bookId: string, job: Pick<GenJob, "kind" | "page_n" | "variant" | "job_key">, ext = "png", attempt?: number): string {
  // la huella al final evita pisar la imagen de una versión anterior si cambian los rasgos o el cuento
  const key = job.job_key.split(":").pop()!.slice(0, 8);
  return `books/${bookId}/${job.kind}-${job.page_n ?? 0}-${job.variant}-${key}${attempt && attempt > 1 ? `-r${attempt}` : ""}.${ext}`;
}

/** Marca de los jobs del flujo nuevo en `references`: formato, resolución y si pasa control de calidad. */
export interface V2Spec {
  kind: "v2";
  aspect: "3:2" | "1:1";
  size: ImageSize;
  qc?: boolean;
}

export function v2Of(job: Pick<GenJob, "references">): V2Spec | null {
  const refs = Array.isArray(job.references) ? (job.references as unknown as Partial<V2Spec>[]) : [];
  const r = refs.find((x) => x && x.kind === "v2");
  return r && (r.aspect === "3:2" || r.aspect === "1:1") && (r.size === "1K" || r.size === "2K" || r.size === "4K") ? (r as V2Spec) : null;
}

/** Candidatas guardadas de un job (cada intento con su control de calidad). */
export interface Candidate {
  path: string;
  qc?: Pick<QcResult, "pass" | "problems"> | null;
  width?: number;
  height?: number;
}

function perBookCap(): number {
  const v = Number(process.env.MAX_COST_CENTS_PER_BOOK ?? "300");
  return Number.isFinite(v) && v >= 0 ? v : 300;
}

export type RunResult = { ok: true; job: GenJob; ran: boolean } | Fail;

export async function runJob(store: GenStore, jobId: unknown, adapter: GenerationAdapter, now = () => Date.now()): Promise<RunResult> {
  if (typeof jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(jobId)) return fail(400, "job_id");
  const job = await store.getJob(jobId);
  if (!job || !job.job_key) return fail(404, "not_found");
  if (job.status === "done" || job.status === "failed") return { ok: true, job, ran: false };
  if (job.status === "running") {
    const stale = now() - Date.parse(job.updated_at) > STALE_RUNNING_MS;
    if (!stale || job.attempts >= MAX_ATTEMPTS) return stale ? finish(store, job, "failed", "tiempo agotado") : { ok: true, job, ran: false };
  }
  const style = getStyle(job.style_id);
  if (!style) return finish(store, job, "failed", `estilo desconocido: ${job.style_id}`);
  const book = await store.getBookById(job.book_id);
  if (!book) return fail(404, "book_not_found");

  // la hoja de referencia tiene que estar pintada antes que cualquier página
  let sheetRef: { ref: ImageRef; bible: string } | null = null;
  if (job.kind !== "sheet") {
    const sheetId = refSheetId(job);
    const sheet = sheetId ? await store.getJob(sheetId) : null;
    if (!sheet || sheet.status === "pending" || sheet.status === "running") return fail(409, "waiting_sheet");
    if (sheet.status === "failed") return finish(store, job, "failed", "la hoja de personaje no se pudo pintar");
    const ref = sheet.storage_path ? await store.signedUrl(sheet.storage_path, 600) : null;
    sheetRef = { ref: ref ? { url: ref } : { path: sheet.chosen ?? "dry-run/sheet.png" }, bible: sheet.prompt };
  }

  // presupuesto antes de reclamar: si no hay, el job pagado espera (429) y el de muestra falla con el motivo
  const v2 = v2Of(job);
  // flujo nuevo (26 oct): antes del pago, el presupuesto es del libro (el número de libros por persona se mira al
  // empezar, lib/book/freeLimit.ts). El flujo antiguo sigue contando por email
  const lead = job.paid || v2 ? book.id : book.email;
  if (!lead) return finish(store, job, "failed", "lead sin email");
  const gate = await gateSpend(store.db, { leadId: lead, images: 1, provider: adapter.name, paid: job.paid, size: v2?.size, leadCap: v2 && !job.paid ? freeBookCapCents() : undefined });
  if (!gate.ok) {
    if (job.paid) return fail(429, "budget", gate.reason);
    // 26 oct (Álvaro): si ya hay una imagen pintada que el control de calidad mandó repetir y no queda presupuesto para
    // repetirla, se queda esa. No se tira una imagen ya pagada ni se deja el libro sin portada
    const kept = qcFallback(job);
    if (kept) {
      await store.updateJob(job.id, { status: "done", chosen: kept, storage_path: kept, error: `qc sin repetir: ${gate.reason}`.slice(0, 300) });
      return { ok: true, job: (await store.getJob(job.id)) ?? job, ran: false };
    }
    return finish(store, job, "failed", `presupuesto: ${gate.reason}`);
  }
  if (job.paid && gate.cents > 0) {
    const spent = (await store.listJobs(book.id)).reduce((a, j) => a + (j.cost_cents ?? 0), 0);
    if (spent + gate.cents > perBookCap()) return finish(store, job, "failed", `tope de coste por libro (${perBookCap()} c) alcanzado`);
  }

  const claimed = await store.claim(job);
  if (!claimed) return { ok: true, job: (await store.getJob(job.id)) ?? job, ran: false };

  try {
    let result: GenerationResult;
    if (v2) {
      const refs: ImageRef[] = [...(sheetRef ? [sheetRef.ref] : []), { path: style.anchorPath }];
      result = await adapter.generateImage(job.prompt, refs, { aspect: v2.aspect, size: v2.size });
    } else if (job.kind === "sheet") result = await adapter.generateSheet(job.prompt, style, { candidates: 1 });
    else result = await adapter.generateScene(sheetRef!.ref, style, job.prompt, { candidates: 1, bible: sheetRef!.bible });
    const img = result.images[0];
    if (!img) throw new Error("el proveedor no devolvió imagen");
    const record = async () => {
      if (result.costCents <= 0) return;
      const rec = await recordSpend(store.db, { leadId: lead, kind: SPEND_KIND[job.kind], provider: result.provider, model: result.model, cents: result.costCents });
      if (!rec.ok) console.error(`[generate] gasto sin registrar (${job.kind} ${job.id}): ${rec.reason}`);
    };
    const prevCandidates = Array.isArray(claimed.candidates) ? (claimed.candidates as unknown as (Candidate | string)[]) : [];
    const cost = (claimed.cost_cents ?? 0) + result.costCents;
    let chosen: string;
    let storage: string | null = null;
    let candidate: Candidate | string;
    if (img.data && v2) {
      const jpg = await toJpeg(img.data);
      storage = storagePath(book.id, job, "jpg", claimed.attempts);
      await store.upload(storage, jpg.data, jpg.mimeType);
      chosen = storage;
      const qc = v2.qc === false ? null : await qcImage(await thumbnail(jpg.data), job.prompt);
      candidate = { path: storage, qc: qc ? { pass: qc.pass, problems: qc.problems } : null, width: jpg.width, height: jpg.height };
      if (qc && !qc.pass && claimed.attempts < MAX_ATTEMPTS) {
        // un intento más antes de enseñarla: vuelve a pendiente con el motivo (el cliente la vuelve a pedir)
        await store.updateJob(job.id, { status: "pending", candidates: [...prevCandidates, candidate] as unknown as GenJob["candidates"], cost_cents: cost, error: `qc: ${qc.problems.join("; ")}`.slice(0, 300) });
        await record();
        const again = await store.getJob(job.id);
        return { ok: true, job: again ?? job, ran: true };
      }
    } else if (img.data) {
      storage = storagePath(book.id, job);
      await store.upload(storage, img.data, img.mimeType ?? "image/png");
      chosen = storage;
      candidate = chosen;
    } else {
      chosen = img.placeholder ?? `dry-run/${style.id}/${job.kind}-${job.page_n ?? 0}-${job.variant}.png`;
      candidate = chosen;
    }
    await store.updateJob(job.id, {
      status: "done",
      candidates: (v2 ? [...prevCandidates, candidate] : [chosen]) as unknown as GenJob["candidates"],
      chosen,
      storage_path: storage,
      cost_cents: cost,
      error: null,
    });
    await record();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    // un fallo pasajero del proveedor (429, 5xx, red, tiempo agotado) no gasta el intento: el job queda fallido y se
    // reabre al volver al libro, al reintentar o en el rescate (auditoría 26 oct, B4)
    const transient = isTransient(e);
    // un tiempo agotado sí se apunta como gasto (estimado): el proveedor pudo cobrarlo, y así el tope por libro y el del
    // día frenan los reintentos sin fin cuando va lento (revisión 26 oct). 429, 5xx y red no se cobran
    const charged = isTimeout(e) ? estimatedCostCents(adapter.name, v2?.size) : 0;
    await store.updateJob(job.id, {
      status: "failed",
      error: `${transient ? "pasajero: " : ""}${msg}`.slice(0, 300),
      ...(transient ? { attempts: Math.max(0, claimed.attempts - 1) } : {}),
      ...(charged > 0 ? { cost_cents: (claimed.cost_cents ?? 0) + charged } : {}),
    });
    if (charged > 0) {
      const rec = await recordSpend(store.db, { leadId: lead, kind: SPEND_KIND[job.kind], provider: adapter.name, model: "tiempo-agotado", cents: charged }).catch(() => null);
      if (!rec?.ok) console.error(`[generate] gasto del tiempo agotado sin registrar (${job.kind} ${job.id})`);
    }
    console.error(`[generate] ${job.kind} ${job.id} falló${transient ? " (pasajero)" : ""}`);
  }
  const after = await store.getJob(job.id);
  return { ok: true, job: after ?? job, ran: true };
}

/** La última imagen ya pintada de un job (la que el control de calidad mandó repetir), o null si no hay ninguna. */
export function qcFallback(job: Pick<GenJob, "candidates">): string | null {
  const list = Array.isArray(job.candidates) ? (job.candidates as unknown as (Candidate | string)[]) : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    const path = typeof c === "string" ? c : c?.path;
    if (typeof path === "string" && path && !path.startsWith("dry-run")) return path;
  }
  return null;
}

async function finish(store: GenStore, job: GenJob, status: "failed", error: string): Promise<RunResult> {
  await store.updateJob(job.id, { status, error: error.slice(0, 300) });
  return { ok: true, job: (await store.getJob(job.id)) ?? job, ran: false };
}

function refSheetId(job: GenJob): string | undefined {
  const refs = Array.isArray(job.references) ? (job.references as { kind?: string; job_id?: string }[]) : [];
  return refs.find((r) => r && r.kind === "sheet")?.job_id;
}

/* ------------------------------ estado ------------------------------ */

export interface PublicJob {
  id: string;
  kind: JobKind;
  page: number | null;
  variant: number;
  status: GenJob["status"];
  /** Motivo corto si ha fallado: "budget" (presupuesto) o "error". */
  error: "budget" | "error" | null;
  url: string | null;
  placeholder: boolean;
  paid: boolean;
  key: string;
}

export async function jobStatus(store: GenStore, bookId: unknown): Promise<{ ok: true; bookId: string; jobs: PublicJob[] } | Fail> {
  const publicId = typeof bookId === "string" && /^[a-z0-9]{8,16}$/.test(bookId) ? bookId : undefined;
  if (!publicId) return fail(400, "book_id");
  const book = await store.findBook({ publicId });
  if (!book) return { ok: true, bookId: publicId, jobs: [] };
  const jobs = sortJobs(await store.listJobs(book.id));
  const out: PublicJob[] = [];
  for (const j of jobs) {
    const url = j.status === "done" && j.storage_path ? await store.signedUrl(j.storage_path, 600) : null;
    out.push({
      id: j.id,
      kind: j.kind,
      page: j.page_n,
      variant: j.variant,
      status: j.status,
      error: j.status === "failed" ? (j.error?.startsWith("presupuesto") ? "budget" : "error") : null,
      url,
      placeholder: j.status === "done" && !j.storage_path,
      paid: j.paid,
      key: j.job_key.split(":").pop() ?? "",
    });
  }
  return { ok: true, bookId: publicId, jobs: out };
}

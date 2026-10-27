/**
 * El PDF que se descarga (auditoría 26 oct, I10): se pinta una vez y se guarda en el bucket, en la carpeta del libro
 * (books/<id>/, el borrado se lo lleva con él). Las descargas siguientes son una URL firmada: ni Chromium ni espera.
 *
 * - El nombre del archivo lleva una huella de lo que sale en él: la maqueta entera, con las imágenes elegidas por id. Si
 *   cambia el cuento, una imagen, las letras o la maqueta, se pinta otro; un despliegue que no la toca, no.
 * - Dos peticiones a la vez por el mismo PDF en la misma instancia comparten el trabajo, y los Chromium van de uno en uno
 *   (lib/pdf/queue.ts).
 * - Solo cuenta en el límite por IP lo que se pinta de verdad, y si falla se devuelve el turno.
 *
 * Sin `server-only`: Chromium llega como dependencia (`render`), y así lo prueban los tests.
 */
import { createHash } from "node:crypto";
import type { Fail } from "../generation/service";
import type { GenStore } from "../generation/store";
import type { Book2PdfInput } from "../pdf/book2";
import { pdfBookHtml } from "../pdf/printHtml";
import { QueueBusy } from "../pdf/queue";
import { bookView, unsignedImages, type BookView } from "./service";

export type PdfKind = "full" | "free";

export interface PdfDeps {
  render(input: Book2PdfInput): Promise<Uint8Array>;
  /** El límite por IP, solo antes de pintar uno nuevo. `undo` devuelve el turno si falla. */
  allowRender?(): { ok: true; undo(): void } | { ok: false };
  env?: Record<string, string | undefined>;
}

export type PdfResult =
  /** Guardado en el bucket: URL firmada que lo descarga con su nombre. */
  | { ok: true; url: string; filename: string }
  /** Sin bucket (en memoria) o si no se pudo guardar: los bytes. */
  | { ok: true; pdf: Uint8Array; filename: string }
  | (Fail & { pages?: number[] });

/** Minutos que vale la URL firmada: solo para descargarlo ahora. */
const SIGNED_S = 10 * 60;

/** Lo que el padre lee si no sale (también en la página de error de la descarga directa). */
export function pdfErrorMessage(error: string): string {
  switch (error) {
    case "not_found":
    case "book_id":
      return "Este enlace ya no es válido. Guardamos los libros 30 días.";
    case "not_paid":
      return "Este PDF es el del libro ilustrado. Vuelve a tu libro para terminar el pedido.";
    case "pages_missing":
      return "Aún faltan páginas por pintar. Vuelve a tu libro y espera a que estén todas.";
    case "rate_limited":
      return "Has pedido muchos PDF en poco tiempo. Espera un rato y vuelve a intentarlo.";
    case "pdf_busy":
      return "Ahora mismo estamos preparando otros PDF. Vuelve a intentarlo en un minuto: tu libro sigue guardado.";
    default:
      return "No hemos podido preparar el PDF ahora mismo. Vuelve a intentarlo en un momento: tu libro sigue guardado.";
  }
}

const fail = (status: number, error: string, extra: { pages?: number[] } = {}): Fail & { pages?: number[] } => ({ ok: false, status, error, reason: pdfErrorMessage(error), ...extra });

export function pdfFilename(view: Pick<BookView, "ficha">, kind: PdfKind): string {
  const slug =
    view.ficha.hero.name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "libro";
  return `cuento-${slug}${kind === "full" ? "-ilustrado" : ""}.pdf`;
}

/**
 * Huella de lo que sale en el PDF: la maqueta entera (pdfBookHtml, con las letras dentro) con cada imagen nombrada por su
 * job, no por su URL firmada, que cambia en cada vista. Cualquier cambio del cuento, de las imágenes elegidas o de la
 * maqueta da otra huella, sin tener que acordarse de subir una versión (revisión 27 oct).
 */
export function pdfKey(view: Pick<BookView, "plan" | "ficha" | "chosen">, kind: PdfKind): string {
  const ref = (id: string | null | undefined) => (id ? `job:${id}` : null);
  const pageUrls: Record<number, string | null> = {};
  for (let n = 1; n <= 12; n++) pageUrls[n] = ref(view.chosen.pages[n]);
  const html = pdfBookHtml(
    {
      plan: view.plan,
      heroName: view.ficha.hero.name.trim(),
      from: view.ficha.from?.trim() || undefined,
      coverUrl: ref(view.chosen.cover),
      sheetUrl: ref(view.chosen.sheet),
      portraits: view.chosen.portraits.map((p) => ({ name: p.name, url: ref(p.job) })),
      pageUrls,
      date: new Date(0),
    },
    kind,
  ).html;
  return createHash("sha256").update(kind).update(html).digest("hex").slice(0, 20);
}

/** Pintados en curso en esta instancia, por archivo: el segundo que llega espera al primero. */
const inflight = new Map<string, Promise<PdfResult>>();

export async function bookPdf(store: GenStore, bookId: unknown, kind: PdfKind, deps: PdfDeps): Promise<PdfResult> {
  const env = deps.env ?? process.env;
  // primero, sin firmar nada: qué va en el libro
  const light = await bookView(store, bookId, env, { sign: false });
  if (!light.ok) return fail(light.status, light.error);
  if (kind === "full") {
    if (!light.paid) return fail(402, "not_paid");
    const missing = Object.entries(light.chosen.pages)
      .filter(([, id]) => !id)
      .map(([n]) => Number(n));
    if (missing.length) return fail(409, "pages_missing", { pages: missing });
  }
  const book = await store.findBook({ publicId: light.bookId });
  if (!book) return fail(404, "not_found");
  const filename = pdfFilename(light, kind);
  const path = `books/${book.id}/descarga-${kind}-${pdfKey(light, kind)}.pdf`;

  if (store.mode === "supabase" && (await store.exists(path).catch(() => false))) {
    const url = await store.signedUrl(path, SIGNED_S, { download: filename });
    if (url) return { ok: true, url, filename };
  }

  const running = inflight.get(path);
  if (running) return running;
  const job = paint(store, light.bookId, kind, path, filename, deps, env);
  inflight.set(path, job);
  try {
    return await job;
  } finally {
    inflight.delete(path);
  }
}

async function paint(store: GenStore, bookId: string, kind: PdfKind, path: string, filename: string, deps: PdfDeps, env: Record<string, string | undefined>): Promise<PdfResult> {
  const turn = deps.allowRender?.() ?? { ok: true as const, undo: () => undefined };
  if (!turn.ok) return fail(429, "rate_limited");
  try {
    const view = await bookView(store, bookId, env);
    if (!view.ok) {
      turn.undo();
      return fail(view.status, view.error);
    }
    // pintada pero sin URL (falló la firma): el PDF saldría con el hueco, y ahora se guarda; mejor que lo intente otra vez
    // (I8). En el gratis, lo que lleva: la portada y los personajes (revisión 27 oct)
    const gaps = unsignedImages(view).filter((g) => kind === "full" || !g.startsWith("página"));
    if (gaps.length) {
      console.error(`[libro/pdf] sin URL: ${gaps.join(", ")}`);
      turn.undo();
      return fail(503, "render_failed");
    }
    const byId = new Map(view.jobs.map((j) => [j.id, j]));
    const urlOf = (id: string | null | undefined) => (id ? byId.get(id)?.url ?? null : null);
    const pageUrls: Record<number, string | null> = {};
    for (let n = 1; n <= 12; n++) pageUrls[n] = urlOf(view.chosen.pages[n]);
    const pdf = await deps.render({
      plan: view.plan,
      heroName: view.ficha.hero.name.trim(),
      from: view.ficha.from?.trim() || undefined,
      coverUrl: urlOf(view.chosen.cover),
      sheetUrl: urlOf(view.chosen.sheet),
      portraits: view.chosen.portraits.map((p) => ({ name: p.name, url: urlOf(p.job) })),
      pageUrls,
      date: new Date(),
      kind,
    });
    if (store.mode === "supabase") {
      // dos intentos: sin guardar, la descarga va por otra instancia y se pintaría otra vez (revisión 27 oct)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await store.upload(path, pdf, "application/pdf");
          const url = await store.signedUrl(path, SIGNED_S, { download: filename });
          if (url) return { ok: true, url, filename };
        } catch (e) {
          // se descarga igual; la próxima vez se vuelve a intentar guardar
          console.error("[libro/pdf] guardar", e instanceof Error ? e.message.slice(0, 200) : "error");
        }
      }
    }
    return { ok: true, pdf, filename };
  } catch (e) {
    turn.undo();
    // la cola de Chromium no da el turno a tiempo: otros PDF en esta instancia
    if (e instanceof QueueBusy) return fail(503, "pdf_busy");
    console.error("[libro/pdf]", e instanceof Error ? e.message.slice(0, 200) : "error");
    return fail(503, "render_failed");
  }
}

/**
 * Rescate de libros pagados (auditoría 26 oct, B4). Si el padre cierra la pestaña o el proveedor falla, el segundo plano
 * de la ruta no siempre termina las 12 páginas, y nada las retomaba hasta que el padre volvía. El cron
 * `/api/cron/rescue` recorre los pedidos pagados de los últimos 31 días (el libro dura 30 desde el pago) y, por cada
 * libro sin el email de «listo»: encola lo que falte (también la dirección de arte, si falló), reabre lo fallido con
 * intentos libres, retoma lo colgado y lo pinta; si queda terminado, manda el «listo». Si lleva horas sin terminar,
 * avisa a soporte una vez.
 *
 * Cada entorno, solo sus pedidos (`orderBelongsToEnv`): la preview no toca libros de clientes reales.
 */
import type { GenerationAdapter } from "../generation/adapter";
import { STALE_RUNNING_MS } from "../generation/service";
import type { GenStore } from "../generation/store";
import type { PaidOrder } from "../print/types";
import type { Llm } from "../llm";
import { orderBelongsToEnv } from "../stripe";
import { paintAll } from "./background";
import { bookLine } from "../support";
import { alertPaidFailures, bookView, draftV2, markStuckAlerted, notifyBookReady, pendingPageJobs, requestPages } from "./service";

type Env = Record<string, string | undefined>;

const HOUR = 3600_000;
/** Un libro se guarda 30 días desde el pago: más allá no hay nada que rescatar. */
const LOOKBACK_MS = 31 * 24 * HOUR;
/** Pagado hace más de esto y sin terminar: aviso a soporte. */
export const STUCK_AFTER_MS = 2 * HOUR;

export interface RescueDeps {
  adapter: GenerationAdapter;
  /** Enlace del libro (para el «listo» y el aviso a soporte). */
  link: (publicId: string) => string;
  readyMail: Parameters<typeof notifyBookReady>[3];
  notify: (subject: string, text: string) => Promise<{ sent: boolean }>;
  /** No se empieza nada más tarde de esto (ms epoch, reloj real). */
  deadline: number;
  /** Reloj para las edades (pedido, trabajos colgados); en los tests, adelantado. */
  now?: () => number;
  env?: Env;
  llm?: Llm;
}

export interface RescueReport {
  /** Libros sin terminar o sin el «listo» que se han mirado. */
  books: number;
  /** Imágenes terminadas en esta pasada. */
  painted: number;
  mailed: number;
  alerted: number;
  /** Libros que no se han mirado por falta de tiempo (los mira la pasada siguiente). */
  skipped: number;
  errors: number;
}

export async function rescueBooks(store: GenStore, deps: RescueDeps): Promise<RescueReport> {
  const now = deps.now ?? Date.now;
  const env = deps.env ?? process.env;
  const report: RescueReport = { books: 0, painted: 0, mailed: 0, alerted: 0, skipped: 0, errors: 0 };
  // solo los pedidos de este entorno y los más recientes primero, filtrado en la consulta: antes se pedían los 300 más
  // antiguos y se filtraba después, y los pedidos de prueba o ya terminados dejaban fuera a los nuevos (revisión 26 oct)
  const orders = await store.listPaidOrdersSince(new Date(now() - LOOKBACK_MS).toISOString(), 500, env.VERCEL_ENV === "production");
  // por libro, el primer cobro (la mejora a tapa dura es un segundo pedido): desde ahí cuentan las horas sin terminar
  const firstOrder = new Map<string, PaidOrder>();
  for (const o of orders) {
    if (!orderBelongsToEnv(o.sessionId, env)) continue;
    const prev = firstOrder.get(o.bookId);
    if (!prev || o.createdAt < prev.createdAt) firstOrder.set(o.bookId, o);
  }

  for (const [bookUuid, order] of firstOrder) {
    const book = await store.getBookById(bookUuid);
    const d = book ? draftV2(book) : null;
    if (!book || !d || d.readyMailedAt) continue;
    if (Date.now() >= deps.deadline) {
      report.skipped++;
      continue;
    }
    report.books++;
    const pid = book.public_id;
    let failure: string | null = null;
    try {
      // ya terminado (sin «listo» porque falló el email o no hay): solo se intenta el email, sin tocar nada más
      const before = await bookView(store, pid, env);
      if (before.ok && Object.values(before.chosen.pages).every(Boolean) && before.chosen.cover && !before.portraitsToRequest) {
        if (await notifyBookReady(store, pid, deps.link, deps.readyMail)) report.mailed++;
        continue;
      }
      const req = await requestPages(store, { bookId: pid }, deps.adapter, { dryRunPayment: false, env }, deps.llm);
      if (!req.ok && req.error !== "printed") console.warn(`[rescate] ${pid}: ${req.error}`);
      const hung = (await store.listJobs(book.id)).filter((j) => j.status === "running" && now() - Date.parse(j.updated_at) > STALE_RUNNING_MS).map((j) => j.id);
      const ids = [...new Set([...(req.ok ? req.jobs : []), ...(await pendingPageJobs(store, pid)), ...hung])];
      if (ids.length > 0) {
        const out = await paintAll(store, deps.adapter, ids, { concurrency: 3, deadline: deps.deadline });
        report.painted += Object.values(out).filter((x) => x === "done").length;
      }
      if (await notifyBookReady(store, pid, deps.link, deps.readyMail)) {
        report.mailed++;
        continue;
      }
      // una imagen que ya no va a salir sola: aviso a soporte, una vez por libro (I3)
      await alertPaidFailures(store, pid, deps.notify);
    } catch (e) {
      report.errors++;
      failure = e instanceof Error ? e.message.slice(0, 200) : "error";
      console.error(`[rescate] ${pid}: ${failure}`);
    }
    // sin terminar desde hace horas: aviso a soporte, una vez por libro, también si el rescate ha fallado (revisión 26 oct)
    try {
      if (await alertIfStuck(store, deps, { bookUuid, pid, order, title: d.plan.title, env, now: now(), failure })) report.alerted++;
    } catch (e) {
      report.errors++;
      console.error(`[rescate] aviso ${pid}: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
    }
  }
  return report;
}

async function alertIfStuck(
  store: GenStore,
  deps: RescueDeps,
  { bookUuid, pid, order, title, env, now, failure }: { bookUuid: string; pid: string; order: PaidOrder; title: string; env: Env; now: number; failure: string | null },
): Promise<boolean> {
  if (now - Date.parse(order.createdAt) <= STUCK_AFTER_MS) return false;
  const book = await store.getBookById(bookUuid);
  const fresh = book ? draftV2(book) : null;
  if (!fresh || fresh.stuckAlertedAt || fresh.readyMailedAt) return false;
  const view = await bookView(store, pid, env).catch(() => null);
  const missing = view?.ok ? Object.entries(view.chosen.pages).filter(([, job]) => !job).map(([n]) => n) : null;
  // terminado pero sin «listo» (falló el email) no es un libro atascado
  if (missing && missing.length === 0 && !failure) return false;
  const r = await deps
    .notify(
      "Libro pagado sin terminar",
      [
        `«${title}» se pagó el ${new Date(order.createdAt).toISOString().slice(0, 16).replace("T", " ")} (UTC) y ${missing ? `le faltan ${missing.length} de 12 páginas${missing.length ? ` (${missing.join(", ")})` : ""}` : "no se ha podido mirar cómo va"}.`,
        failure ? `El rescate ha fallado: ${failure}` : "",
        `Edición: ${order.edition}. Pedido: ${order.id}. ${bookLine(bookUuid)}`,
        "El rescate lo seguirá intentando. Si no avanza, mira el proveedor de imágenes (saldo, caídas), el de textos y el tope por libro (MAX_COST_CENTS_PER_BOOK).",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .catch(() => ({ sent: false }));
  if (!r.sent) return false;
  await markStuckAlerted(store, pid, now);
  return true;
}

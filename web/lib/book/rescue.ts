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
import { bookView, draftV2, markStuckAlerted, notifyBookReady, pendingPageJobs, requestPages } from "./service";

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
  const orders = await store.listPaidOrdersSince(new Date(now() - LOOKBACK_MS).toISOString(), 300);
  const firstOrder = new Map<string, PaidOrder>();
  for (const o of orders) if (orderBelongsToEnv(o.sessionId, env) && !firstOrder.has(o.bookId)) firstOrder.set(o.bookId, o);

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
      // sin terminar desde hace horas: aviso a soporte, una vez por libro (terminado pero sin «listo», no es esto)
      const view = await bookView(store, pid, env);
      const missing = view.ok ? Object.entries(view.chosen.pages).filter(([, job]) => !job).map(([n]) => n) : [];
      const fresh = draftV2((await store.getBookById(bookUuid)) ?? book) ?? d;
      if (missing.length > 0 && now() - Date.parse(order.createdAt) > STUCK_AFTER_MS && !fresh.stuckAlertedAt) {
        const r = await deps
          .notify(
            "Libro pagado sin terminar",
            [
              `«${d.plan.title}» se pagó el ${new Date(order.createdAt).toISOString().slice(0, 16).replace("T", " ")} (UTC) y le faltan ${missing.length} de 12 páginas (${missing.join(", ")}).`,
              `Edición: ${order.edition}. Libro: ${deps.link(pid)}`,
              "El rescate lo seguirá intentando. Si no avanza, mira el proveedor de imágenes (saldo, caídas) y el tope por libro (MAX_COST_CENTS_PER_BOOK).",
            ].join("\n"),
          )
          .catch(() => ({ sent: false }));
        if (r.sent) {
          await markStuckAlerted(store, pid, now());
          report.alerted++;
        }
      }
    } catch (e) {
      report.errors++;
      console.error(`[rescate] ${pid}: ${e instanceof Error ? e.message.slice(0, 200) : "error"}`);
    }
  }
  return report;
}

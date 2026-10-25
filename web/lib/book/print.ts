/**
 * Libro impreso (B8, D7): del libro pagado y revisado al pedido en la imprenta, y del aviso de la imprenta al email con
 * el seguimiento. El padre decide cuándo sale hacia la imprenta (decisión de Álvaro, 18 oct): no hay envío automático.
 *
 *   awaiting_approval ──(«Mandar a imprimir»)──▶ sending ──▶ sent ──▶ in_production ──▶ shipped ──▶ delivered
 *                                                  │                                        (email con seguimiento)
 *                                                  └──▶ failed (se puede reintentar)
 *
 * Todo lo externo (maquetar el PDF, la API de Gelato, los emails) se inyecta en `PrintDeps`, para probarlo sin red.
 */
import { advances, DEFAULT_PRINT_SIZE, mapGelatoStatus, type CoverGeometry, type GelatoOrder, type GelatoOrderInput, type PrintMode, type PrintSize } from "../print/gelato";
import { shippingLine } from "../print/shipping";
import type { PaidOrder, PrintStatus } from "../print/types";
import type { GenStore } from "../generation/store";
import type { Fail } from "../generation/service";
import type { PrintBookInput } from "../pdf/printHtml";
import { printableInEnv } from "../stripe";
import { bookView, draftV2, loadBook } from "./service";

export interface PrintDeps {
  mode: PrintMode;
  /** Pedidos de verdad o borradores (fuera de producción). */
  orderType: "order" | "draft";
  pageCount: number;
  resolveProductUid(): Promise<string | null>;
  productSize(uid: string): Promise<PrintSize | null>;
  coverGeometry(uid: string, pageCount: number): Promise<CoverGeometry | null>;
  estimatedCover(size: PrintSize): CoverGeometry;
  render(input: PrintBookInput, size: PrintSize, cover: CoverGeometry): Promise<Uint8Array>;
  createOrder(i: GelatoOrderInput): Promise<GelatoOrder | { error: string }>;
  getOrder(id: string): Promise<GelatoOrder | null>;
  mail: {
    sentToPrint(to: string, title: string, link: string, address: string): Promise<{ sent: boolean }>;
    shipped(to: string, title: string, trackingUrl: string): Promise<{ sent: boolean }>;
    reminder(to: string, title: string, link: string): Promise<{ sent: boolean }>;
  };
  link(bookId: string): string;
  now?: () => Date;
}

const fail = (status: number, error: string, reason?: string): Fail => ({ ok: false, status, error, ...(reason ? { reason } : {}) });
const DEFAULT_SIZE: PrintSize = DEFAULT_PRINT_SIZE;
/** El PDF de imprenta se queda en el bucket y la imprenta lo descarga con este enlace firmado. */
const FILE_URL_SECONDS = 7 * 24 * 3600;

/**
 * «Mandar a imprimir»: comprueba que se puede y pasa el pedido a `sending` (una sola vez aunque lleguen dos peticiones).
 * El trabajo largo (maquetar, subir, crear el pedido) lo hace `completePrint`, en segundo plano.
 */
export async function startPrint(
  store: GenStore,
  bookId: unknown,
  mode: PrintMode,
  env: Record<string, string | undefined> = process.env,
): Promise<{ ok: true; orderId: string } | Fail> {
  if (mode === "none") return fail(501, "print_unavailable");
  const loaded = await loadBook(store, bookId);
  if ("ok" in loaded) return loaded;
  const { book } = loaded;
  const order = await store.getOrder(book.id);
  if (!order || order.edition !== "hardcover" || !order.printStatus) return fail(409, "not_hardcover");
  if (order.printStatus !== "awaiting_approval" && order.printStatus !== "failed") return fail(409, "already_sent");
  if (!printableInEnv(order.sessionId, env)) return fail(409, "test_order", "Este libro se pagó en modo de prueba y no se imprime.");
  if (!order.shipping) return fail(409, "no_shipping", "Falta la dirección de envío.");
  const view = await bookView(store, bookId);
  if (!view.ok) return view;
  if (!view.chosen.cover || !Object.values(view.chosen.pages).every(Boolean)) return fail(409, "pages_missing", "Faltan ilustraciones por terminar.");
  if (!book.email) return fail(409, "no_email");
  if (!(await store.claimPrint(order.id, ["awaiting_approval", "failed"], "sending"))) return fail(409, "already_sent");
  await store.updateOrder(order.id, { printError: null });
  return { ok: true, orderId: order.id };
}

/** Maqueta el PDF, lo sube y crea el pedido en la imprenta. Si algo falla, el pedido queda en `failed` con el motivo. */
export async function completePrint(store: GenStore, orderId: string, deps: PrintDeps): Promise<{ ok: true; printOrderId: string } | Fail> {
  const now = deps.now?.() ?? new Date();
  const order = await store.getOrderById(orderId);
  if (!order || order.printStatus !== "sending") return fail(409, "not_sending");
  const failWith = async (error: string): Promise<Fail> => {
    console.error("[imprenta]", order.id, error);
    await store.updateOrder(order.id, { printStatus: "failed", printError: error.slice(0, 300) });
    return fail(502, "print_failed", error);
  };
  try {
    const book = await store.getBookById(order.bookId);
    const d = book ? draftV2(book) : null;
    if (!book || !d || !book.email || !order.shipping) return await failWith("libro_o_direccion");
    const view = await bookView(store, book.public_id);
    if (!view.ok) return await failWith(`vista: ${view.error}`);
    const byId = new Map(view.jobs.map((j) => [j.id, j]));
    const url = (id: string | null) => (id ? byId.get(id)?.url ?? null : null);
    const pageUrls: Record<number, string | null> = {};
    for (let n = 1; n <= 12; n++) pageUrls[n] = url(view.chosen.pages[n]);
    const input: PrintBookInput = { plan: view.plan, heroName: view.ficha.hero.name.trim(), from: view.ficha.from?.trim() || undefined, coverUrl: url(view.chosen.cover), sheetUrl: url(view.chosen.sheet), portraits: view.chosen.portraits.map((p) => ({ name: p.name, url: url(p.job) })), pageUrls, date: now };

    let productUid = "dry-run";
    let size = DEFAULT_SIZE;
    let cover = deps.estimatedCover(size);
    if (deps.mode === "gelato") {
      const uid = await deps.resolveProductUid();
      if (!uid) return await failWith("sin_producto: falta GELATO_PRODUCT_UID");
      productUid = uid;
      size = (await deps.productSize(uid)) ?? DEFAULT_SIZE;
      const real = await deps.coverGeometry(uid, deps.pageCount);
      // sin las medidas reales la cubierta saldría descuadrada: mejor no mandarla
      if (!real) return await failWith("sin_medidas_de_cubierta");
      cover = real;
    }
    const pdf = await deps.render(input, size, cover);
    let fileUrl = `https://example.invalid/dry-run/${book.public_id}.pdf`;
    if (store.mode === "supabase") {
      const path = `books/${book.id}/imprenta-${now.getTime()}.pdf`;
      await store.upload(path, pdf, "application/pdf");
      const signed = await store.signedUrl(path, FILE_URL_SECONDS);
      if (!signed) return await failWith("sin_enlace_del_pdf");
      fileUrl = signed;
    }

    let printOrderId = `dry-run:${book.public_id}`;
    if (deps.mode === "gelato") {
      const r = await deps.createOrder({ orderReferenceId: order.id, customerReferenceId: book.public_id, productUid, pageCount: deps.pageCount, fileUrl, shipping: order.shipping, email: book.email, orderType: deps.orderType });
      if ("error" in r) return await failWith(r.error);
      printOrderId = r.id;
    }
    await store.updateOrder(order.id, { printStatus: "sent", printOrderId, sentAt: now.toISOString(), printError: null });
    await deps.mail.sentToPrint(book.email, d.plan.title, deps.link(book.public_id), shippingLine(order.shipping)).catch(() => ({ sent: false }));
    console.log(`[imprenta] ${book.public_id} → ${printOrderId} (${deps.mode}, ${deps.orderType}, ${pdf.length} bytes)`);
    return { ok: true, printOrderId };
  } catch (e) {
    return failWith(e instanceof Error ? e.message : "error");
  }
}

export type RefreshOutcome = "updated" | "unchanged" | "not_found" | "skipped";

/** Pregunta a la imprenta por el pedido y apunta el estado y el seguimiento; al salir, manda el email (una vez). */
export async function refreshPrint(store: GenStore, order: PaidOrder, deps: PrintDeps): Promise<RefreshOutcome> {
  if (deps.mode !== "gelato" || !order.printOrderId || order.printOrderId.startsWith("dry-run")) return "skipped";
  const g = await deps.getOrder(order.printOrderId);
  if (!g) return "not_found";
  const status: PrintStatus = mapGelatoStatus(g.status);
  const patch: Parameters<GenStore["updateOrder"]>[1] = {};
  if (advances(order.printStatus, status)) patch.printStatus = status;
  if (g.trackingUrl && g.trackingUrl !== order.trackingUrl) patch.trackingUrl = g.trackingUrl;
  if (status === "failed") patch.printError = `imprenta: ${g.status}`;
  const tracking = patch.trackingUrl ?? order.trackingUrl;
  const nowShipped = (patch.printStatus ?? order.printStatus) === "shipped" || (patch.printStatus ?? order.printStatus) === "delivered";
  if (nowShipped && tracking && !order.shippedMailedAt) {
    const book = await store.getBookById(order.bookId);
    const d = book ? draftV2(book) : null;
    if (book?.email) {
      const r = await deps.mail.shipped(book.email, d?.plan.title ?? "Tu libro", tracking).catch(() => ({ sent: false }));
      if (r.sent) patch.shippedMailedAt = (deps.now?.() ?? new Date()).toISOString();
    }
  }
  if (Object.keys(patch).length === 0) return "unchanged";
  await store.updateOrder(order.id, patch);
  return "updated";
}

/**
 * Aviso de la imprenta. No se fía del cuerpo: busca el pedido por la referencia que mandamos (cuentos_orders.id),
 * comprueba que el id de Gelato coincide y vuelve a preguntar a su API.
 */
export async function handlePrintWebhook(store: GenStore, payload: unknown, deps: PrintDeps): Promise<RefreshOutcome | "ignored"> {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const ref = typeof p.orderReferenceId === "string" ? p.orderReferenceId : null;
  const gid = typeof p.orderId === "string" ? p.orderId : null;
  if (!ref || !gid) return "ignored";
  const order = await store.getOrderById(ref);
  if (!order || order.printOrderId !== gid) return "ignored";
  return refreshPrint(store, order, deps);
}

export interface PrintCronReport {
  reminded: number;
  refreshed: number;
  unstuck: number;
}

const HOUR = 3_600_000;

/**
 * Cron diario: recordatorio a quien pagó la tapa dura y no la ha mandado a imprimir (a los 2 días y otra vez a los 7, con
 * las ilustraciones terminadas), pedidos atascados en `sending` más de 15 minutos a `failed` (para reintentar), y
 * consulta de los pedidos abiertos por si un aviso de la imprenta se perdió.
 */
export async function printCron(store: GenStore, deps: PrintDeps): Promise<PrintCronReport> {
  const now = deps.now?.() ?? new Date();
  const report: PrintCronReport = { reminded: 0, refreshed: 0, unstuck: 0 };
  for (const o of await store.listPrintOrders(["awaiting_approval"], 200)) {
    const age = now.getTime() - Date.parse(o.createdAt);
    const sinceReminder = o.remindedAt ? now.getTime() - Date.parse(o.remindedAt) : Infinity;
    const due = (!o.remindedAt && age >= 48 * HOUR) || (!!o.remindedAt && age >= 7 * 24 * HOUR && sinceReminder >= 4 * 24 * HOUR && Date.parse(o.remindedAt) - Date.parse(o.createdAt) < 7 * 24 * HOUR);
    if (!due) continue;
    const book = await store.getBookById(o.bookId);
    if (!book?.email) continue;
    const view = await bookView(store, book.public_id);
    if (!view.ok || !Object.values(view.chosen.pages).every(Boolean)) continue;
    const r = await deps.mail.reminder(book.email, view.plan.title, deps.link(book.public_id)).catch(() => ({ sent: false }));
    if (r.sent) {
      await store.updateOrder(o.id, { remindedAt: now.toISOString() });
      report.reminded++;
    }
  }
  for (const o of await store.listPrintOrders(["sending"], 50)) {
    if (o.sentAt) continue;
    const book = await store.getBookById(o.bookId);
    // `sending` sin terminar: la función se cortó. Se libera para que el padre lo reintente.
    if (book && now.getTime() - Date.parse(o.updatedAt ?? o.createdAt) > 15 * 60_000 && (await store.claimPrint(o.id, ["sending"], "failed"))) {
      await store.updateOrder(o.id, { printError: "interrumpido" });
      report.unstuck++;
    }
  }
  for (const o of await store.listPrintOrders(["sent", "in_production", "shipped"], 100)) {
    if ((await refreshPrint(store, o, deps)) === "updated") report.refreshed++;
  }
  return report;
}

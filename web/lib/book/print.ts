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
import { advances, DEFAULT_PRINT_SIZE, liveGelatoOrder, mapGelatoStatus, type CoverGeometry, type GelatoOrder, type GelatoOrderInput, type PrintMode, type PrintSize } from "../print/gelato";
import { shippingLine } from "../print/shipping";
import { DISPUTE_HOLD, REFUND_HOLD, type PaidOrder, type PrintInfo, type PrintStatus, type PrintStep } from "../print/types";
import type { GenStore } from "../generation/store";
import type { Fail } from "../generation/service";
import type { PrintBookInput } from "../pdf/printHtml";
import { isLiveSession, orderBelongsToEnv, printableInEnv } from "../stripe";
import { bookView, draftV2, loadBook, unsignedImages } from "./service";

export interface PrintDeps {
  mode: PrintMode;
  /** Pedidos de verdad o borradores (fuera de producción). */
  orderType: "order" | "draft";
  /** Método de envío que se pide a la imprenta («normal» = económico). */
  shipmentMethod?: string;
  pageCount: number;
  resolveProductUid(): Promise<string | null>;
  productSize(uid: string): Promise<PrintSize | null>;
  coverGeometry(uid: string, pageCount: number): Promise<CoverGeometry | null>;
  estimatedCover(size: PrintSize): CoverGeometry;
  render(input: PrintBookInput, size: PrintSize, cover: CoverGeometry): Promise<Uint8Array>;
  createOrder(i: GelatoOrderInput): Promise<GelatoOrder | { error: string }>;
  getOrder(id: string): Promise<GelatoOrder | null>;
  /**
   * Pedidos de la imprenta con nuestra referencia (I4). Con la imprenta de verdad, antes de crear un pedido se mira si ya
   * existe; sin esta dependencia (pruebas en dry-run), no se mira.
   */
  findOrders?(reference: string): Promise<GelatoOrder[] | { error: string }>;
  mail: {
    /** `link`: nuestra página de seguimiento. */
    sentToPrint(to: string, title: string, link: string, address: string): Promise<{ sent: boolean }>;
    /** `link`: nuestra página de seguimiento, que lleva al transportista. */
    shipped(to: string, title: string, link: string): Promise<{ sent: boolean }>;
    reminder(to: string, title: string, link: string): Promise<{ sent: boolean }>;
  };
  link(bookId: string): string;
  /** Página propia de seguimiento del pedido (cuentos_orders.id). */
  trackLink(orderId: string): string;
  now?: () => Date;
  /** Entorno (por defecto, process.env): cada entorno solo toca sus pedidos (`orderBelongsToEnv`). */
  env?: Record<string, string | undefined>;
  /** Aviso a soporte (MAIL_FORWARD_TO) cuando un pedido no sale hacia la imprenta o la imprenta lo da por fallido (I12). */
  notify?: (subject: string, text: string) => Promise<{ sent: boolean }>;
}

/** Aviso a soporte de un pedido de tapa dura que falla; nunca rompe el flujo. */
/**
 * Qué ha pasado: no ha salido hacia la imprenta (`send`), la imprenta lo da por fallido y el padre puede volver a mandarlo
 * (`printer_failed`, que crearía otro pedido en Gelato), la imprenta lo ha cancelado o devuelto (`printer_stopped`), no
 * sabemos si llegó (`uncertain`), ya estaba y se reutiliza (`reused`) o hay dos vivos (`duplicate`).
 */
type PrintAlertKind = "send" | "printer_failed" | "printer_stopped" | "uncertain" | "reused" | "duplicate";

async function printAlert(store: GenStore, deps: PrintDeps, order: Pick<PaidOrder, "id" | "bookId">, error: string, kind: PrintAlertKind): Promise<void> {
  if (!deps.notify) return;
  try {
    const book = await store.getBookById(order.bookId);
    const title = (book ? draftV2(book) : null)?.plan.title ?? "libro";
    const advice: Record<PrintAlertKind, string> = {
      send: "El padre puede volver a pulsar «Mandar a imprimir». Si vuelve a fallar, míralo en Gelato y en los logs de Vercel (en Hobby duran una hora).",
      printer_failed: "El padre puede volver a pulsar «Mandar a imprimir», pero eso crea otro pedido en Gelato: mira antes qué ha pasado con el primero.",
      printer_stopped: "El padre ya no puede reenviarlo desde la web. Míralo en Gelato y escríbele.",
      uncertain: "No sabemos si el pedido llegó a Gelato. Se queda «mandándose» (el padre no puede cambiar la dirección ni reenviarlo) y el cron de la imprenta pregunta a Gelato: si está, lo da por enviado; si no, lo libera. Míralo en Gelato si corre prisa.",
      reused: "No se ha creado otro pedido. Comprueba en Gelato que la dirección del pedido es la que tiene ahora el padre: si la cambió después del primer intento, hay que corregirla allí.",
      duplicate: "Pueden salir dos libros por un solo cobro: cancela en Gelato el que sobre.",
    };
    const subject: Record<PrintAlertKind, string> = {
      send: `Tapa dura que no sale hacia la imprenta: «${title}»`,
      printer_failed: `La imprenta ha parado una tapa dura: «${title}»`,
      printer_stopped: `La imprenta ha parado una tapa dura: «${title}»`,
      uncertain: `Tapa dura sin saber si llegó a la imprenta: «${title}»`,
      reused: `Tapa dura que ya estaba en la imprenta: «${title}»`,
      duplicate: `Dos pedidos en la imprenta para una tapa dura: «${title}»`,
    };
    await deps.notify(
      subject[kind],
      [
        `El pedido ${order.id}${["send", "printer_failed", "printer_stopped"].includes(kind) ? " ha fallado" : ""}: ${error.slice(0, 300)}`,
        advice[kind],
        book ? `Libro: ${deps.link(book.public_id)}` : "El libro ya no está.",
      ].join("\n\n"),
    );
  } catch (e) {
    console.warn(`[imprenta] aviso sin enviar: ${e instanceof Error ? e.message.slice(0, 120) : "error"}`);
  }
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
  // la preview no manda a la imprenta (como borrador) un pedido real: lo dejaría como enviado en la base compartida y
  // producción ya no podría mandarlo (auditoría 26 oct, B1)
  if (env.VERCEL_ENV !== "production" && isLiveSession(order.sessionId)) return fail(409, "live_order", "Este pedido es real: se manda a imprimir desde erasesuvez.com.");
  if (!order.shipping) return fail(409, "no_shipping", "Falta la dirección de envío.");
  const view = await bookView(store, bookId);
  if (!view.ok) return view;
  if (!view.chosen.cover || !Object.values(view.chosen.pages).every(Boolean)) return fail(409, "pages_missing", "Faltan ilustraciones por terminar.");
  if (!book.email) return fail(409, "no_email");
  if (!(await store.claimPrint(order.id, ["awaiting_approval", "failed"], "sending"))) return fail(409, "already_sent");
  // un reintento tras «failed» empieza sin la salida anterior: así el cron lo ve si se queda a medias (revisión 27 oct)
  await store.updateOrder(order.id, { printError: null, sentAt: null });
  return { ok: true, orderId: order.id };
}

/** Un error al crear el pedido que no dice si llegó a la imprenta: sin respuesta, un 5xx o una respuesta ilegible. */
export function uncertainPrintError(error: string): boolean {
  return /^gelato_0: red|^gelato_5\d\d|^gelato_respuesta/.test(error);
}

/**
 * ¿Hay ya un pedido vivo (ni fallido ni cancelado) en la imprenta para este? Primero por el id guardado y después por
 * nuestra referencia (I4). `many`: más de uno vivo, que serían dos libros impresos.
 */
async function liveInPrinter(order: Pick<PaidOrder, "id" | "printOrderId">, deps: PrintDeps): Promise<{ live: GelatoOrder | null; many: boolean } | { error: string }> {
  if (order.printOrderId && !order.printOrderId.startsWith("dry-run")) {
    const g = await deps.getOrder(order.printOrderId);
    if (g && liveGelatoOrder([g])) return { live: g, many: false };
  }
  if (!deps.findOrders) return { live: null, many: false };
  const found = await deps.findOrders(order.id);
  if ("error" in found) return found;
  const alive = found.filter((o) => liveGelatoOrder([o]));
  return { live: alive[0] ?? null, many: alive.length > 1 };
}

/** Maqueta el PDF, lo sube y crea el pedido en la imprenta. Si algo falla, el pedido queda en `failed` con el motivo. */
export async function completePrint(store: GenStore, orderId: string, deps: PrintDeps): Promise<{ ok: true; printOrderId: string } | Fail> {
  const now = deps.now?.() ?? new Date();
  const order = await store.getOrderById(orderId);
  if (!order || order.printStatus !== "sending") return fail(409, "not_sending");
  /** El id de la imprenta, en cuanto existe: desde ahí ya no se marca como fallido. */
  let created: string | null = null;
  const failWith = async (error: string): Promise<Fail> => {
    console.error("[imprenta]", order.id, error);
    await store.updateOrder(order.id, { printStatus: "failed", printError: error.slice(0, 300) });
    await printAlert(store, deps, order, error, "send");
    return fail(502, "print_failed", error);
  };
  try {
    const book = await store.getBookById(order.bookId);
    const d = book ? draftV2(book) : null;
    if (!book || !d || !book.email || !order.shipping) return await failWith("libro_o_direccion");
    const view = await bookView(store, book.public_id);
    if (!view.ok) return await failWith(`vista: ${view.error}`);
    // una ilustración sin URL saldría en blanco en el libro impreso: no se manda (I8). En un pedido real a la imprenta,
    // tampoco una del modo sin coste (revisión 27 oct)
    const gaps = unsignedImages(view, { placeholders: deps.mode === "gelato" });
    if (gaps.length) return await failWith(`imagenes_sin_url: ${gaps.join(", ")}`);
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
    // un intento anterior pudo crear el pedido y fallar después (al guardar, o la función cortada): se reutiliza en vez de
    // crear otro, que serían dos libros impresos por un cobro (I4). Se mira antes de maquetar: si ya está, no hace falta
    // el PDF. Si no se puede preguntar, no se crea
    let reuse: GelatoOrder | null = null;
    if (deps.mode === "gelato") {
      const there = await liveInPrinter(order, deps);
      if ("error" in there) return await failWith(there.error);
      reuse = there.live;
      if (there.many) await printAlert(store, deps, order, "hay más de un pedido vivo en Gelato para este libro", "duplicate");
    }
    if (reuse) {
      console.warn("[imprenta]", order.id, "ya estaba en la imprenta:", reuse.id);
      created = reuse.id;
      await store.updateOrder(order.id, { printOrderId: reuse.id }).catch(() => null);
      // con la dirección que tenía entonces: si el padre la ha cambiado después, hay que mirarlo en Gelato
      await printAlert(store, deps, order, `ya estaba en la imprenta (${reuse.id}); se reutiliza en vez de crear otro`, "reused");
      await markSent(store, deps, order, book.email, d.plan.title, reuse.id, now);
      return { ok: true, printOrderId: reuse.id };
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

    // una devolución mientras se maquetaba: el pedido ya no está pagado y no se crea en la imprenta (revisión 27 oct)
    const fresh = await store.getOrderById(order.id);
    if (fresh && (fresh.status ?? "paid") !== "paid") {
      console.warn("[imprenta]", order.id, "devuelto antes de mandarlo: no se crea el pedido");
      await store.updateOrder(order.id, { printStatus: "canceled", printError: REFUND_HOLD });
      return fail(409, "refunded", "El pago de este libro se ha devuelto.");
    }

    let printOrderId = `dry-run:${book.public_id}`;
    if (deps.mode === "gelato") {
      const r = await deps.createOrder({ orderReferenceId: order.id, customerReferenceId: book.public_id, productUid, pageCount: deps.pageCount, fileUrl, shipping: order.shipping, email: book.email, orderType: deps.orderType, shipmentMethodUid: deps.shipmentMethod });
      if ("error" in r) {
        // sin respuesta clara, el pedido pudo crearse: se queda en `sending` (la dirección no se puede cambiar) y el cron
        // pregunta a la imprenta antes de liberarlo. Marcarlo como fallido dejaba reintentar con otra dirección
        if (uncertainPrintError(r.error)) {
          console.error("[imprenta]", order.id, "sin saber si se creó:", r.error);
          await store.updateOrder(order.id, { printError: r.error.slice(0, 300) }).catch(() => null);
          await printAlert(store, deps, order, r.error, "uncertain");
          return fail(502, "print_uncertain", r.error);
        }
        return await failWith(r.error);
      }
      printOrderId = r.id;
      created = printOrderId;
      // el id de la imprenta, guardado nada más tenerlo
      await store.updateOrder(order.id, { printOrderId }).catch(() => null);
    }
    await markSent(store, deps, order, book.email, d.plan.title, printOrderId, now);
    console.log(`[imprenta] ${book.public_id} → ${printOrderId} (${deps.mode}, ${deps.orderType}, ${pdf.length} bytes)`);
    return { ok: true, printOrderId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    // ya está en la imprenta: no se marca como fallido (el padre lo reintentaría). Se queda en `sending` con su id y el cron
    // lo concilia preguntando a la imprenta
    if (created) {
      console.error("[imprenta]", order.id, "en la imprenta, pero sin guardar el estado:", msg.slice(0, 200));
      await printAlert(store, deps, order, `en la imprenta (${created}), pero sin guardar el estado: ${msg}`, "uncertain");
      return fail(502, "print_saved_partially", msg);
    }
    return failWith(msg);
  }
}

/** En la imprenta: estado, id, hitos de cero y el email de «ya está en la imprenta». */
async function markSent(store: GenStore, deps: PrintDeps, order: PaidOrder, email: string, title: string, printOrderId: string, now: Date): Promise<void> {
  // un reintento tras «failed» es un pedido nuevo en la imprenta: nada del anterior (hitos, seguimiento, entrega)
  const info: PrintInfo = { steps: { sent: now.toISOString() } };
  await store.updateOrder(order.id, { printStatus: "sent", printOrderId, sentAt: now.toISOString(), printError: null, trackingUrl: null, info });
  // el libro sigue abriéndose hasta 30 días después de mandarlo (lo que dicen /privacidad §4 y /condiciones §10): si
  // llega dañado, se reimprime con lo guardado (I29). Antes caducaba a los 30 días del pago, saliera cuando saliera
  await store.extendBook(order.bookId, new Date(now.getTime() + KEEP_FOR_PRINT_MS).toISOString()).catch(() => null);
  if (order.shipping && email) await deps.mail.sentToPrint(email, title, deps.trackLink(order.id), shippingLine(order.shipping)).catch(() => ({ sent: false }));
}

export type RefreshOutcome = "updated" | "unchanged" | "not_found" | "skipped";

/** Hitos que se fechan cuando el estado llega a ellos. */
const STEP_OF: Partial<Record<PrintStatus, PrintStep>> = { sent: "sent", in_production: "in_production", shipped: "shipped", delivered: "delivered" };

/** Lo nuevo que cuenta la imprenta del envío, sobre lo que ya teníamos. null si no cambia nada. */
export function mergeInfo(prev: PrintInfo | null, g: GelatoOrder, status: PrintStatus | null, now: Date): PrintInfo | null {
  const next: PrintInfo = { ...(prev ?? {}), steps: { ...(prev?.steps ?? {}) } };
  if (g.method) next.method = g.method;
  if (g.etaFrom) next.etaFrom = g.etaFrom;
  if (g.etaTo) next.etaTo = g.etaTo;
  if (g.trackingCode) next.trackingCode = g.trackingCode;
  const step = status ? STEP_OF[status] : undefined;
  if (step && !next.steps![step]) next.steps![step] = now.toISOString();
  return JSON.stringify(next) === JSON.stringify({ ...(prev ?? {}), steps: { ...(prev?.steps ?? {}) } }) ? null : next;
}

/** Pregunta a la imprenta por el pedido y apunta el estado, el seguimiento y la entrega estimada; al salir, manda el email (una vez). */
export async function refreshPrint(store: GenStore, order: PaidOrder, deps: PrintDeps): Promise<RefreshOutcome> {
  if (deps.mode !== "gelato" || !order.printOrderId || order.printOrderId.startsWith("dry-run")) return "skipped";
  // entregado y ya sin dirección (el borrado de I23): un aviso tardío de la imprenta no vuelve a traer el seguimiento,
  // que después ya no se borraría (revisión 27 oct)
  if (order.printStatus === "delivered" && !order.shipping) return "skipped";
  const g = await deps.getOrder(order.printOrderId);
  if (!g) return "not_found";
  const now = deps.now?.() ?? new Date();
  const status: PrintStatus = mapGelatoStatus(g.status);
  // se creó en la imprenta pero no llegó a guardarse como enviado: se da por enviado como al mandarlo, con su fecha y su
  // email de «ya está en la imprenta» (revisión 27 oct). Lo que cuente después la imprenta llega en la siguiente consulta
  if (order.printStatus === "sending" && liveGelatoOrder([g])) {
    if (!(await store.claimPrint(order.id, ["sending"], "sent"))) return "unchanged";
    const book = await store.getBookById(order.bookId);
    await markSent(store, deps, order, book?.email ?? "", (book ? draftV2(book) : null)?.plan.title ?? "Tu libro", g.id, now);
    return "updated";
  }
  const patch: Parameters<GenStore["updateOrder"]>[1] = {};
  if (advances(order.printStatus, status)) patch.printStatus = status;
  if (g.trackingUrl && g.trackingUrl !== order.trackingUrl) patch.trackingUrl = g.trackingUrl;
  if (status === "failed") patch.printError = `imprenta: ${g.status}`;
  const info = mergeInfo(order.info, g, patch.printStatus ?? null, now);
  if (info) patch.info = info;
  // el email de «va de camino» lleva a nuestra página, que ya cuenta el envío: no espera al número del transportista
  // (el envío económico puede no traerlo)
  const nowShipped = (patch.printStatus ?? order.printStatus) === "shipped" || (patch.printStatus ?? order.printStatus) === "delivered";
  if (nowShipped && !order.shippedMailedAt) {
    const book = await store.getBookById(order.bookId);
    const d = book ? draftV2(book) : null;
    if (book?.email) {
      const r = await deps.mail.shipped(book.email, d?.plan.title ?? "Tu libro", deps.trackLink(order.id)).catch(() => ({ sent: false }));
      if (r.sent) patch.shippedMailedAt = now.toISOString();
    }
  }
  if (Object.keys(patch).length === 0) return "unchanged";
  await store.updateOrder(order.id, patch);
  // la imprenta lo da por fallido, cancelado o devuelto: aviso a soporte, al cambiar a ese estado (I12)
  if (patch.printStatus === "failed") await printAlert(store, deps, order, patch.printError ?? `imprenta: ${g.status}`, "printer_failed");
  if (patch.printStatus === "canceled" || patch.printStatus === "returned") await printAlert(store, deps, order, `imprenta: ${g.status}`, "printer_stopped");
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
  /** Tapas duras sin mandar a imprimir cuyo libro se ha alargado para que siga abriéndose. */
  kept: number;
  /** Envíos cortados a medias que sí llegaron a la imprenta: se dan por enviados en vez de liberarlos (I4). */
  reconciled: number;
}

const HOUR = 3_600_000;
/** Tapa dura sin mandar a imprimir: cuánto se alarga el libro cada vez que se acerca a su fecha. */
const KEEP_FOR_PRINT_MS = 30 * 24 * HOUR;

/**
 * Cron diario: recordatorio a quien pagó la tapa dura y no la ha mandado a imprimir (a los 2 días y otra vez a los 7, con
 * las ilustraciones terminadas), pedidos atascados en `sending` más de 15 minutos a `failed` (para reintentar), y
 * consulta de los pedidos abiertos por si un aviso de la imprenta se perdió.
 */
export async function printCron(store: GenStore, deps: PrintDeps): Promise<PrintCronReport> {
  const now = deps.now?.() ?? new Date();
  const report: PrintCronReport = { reminded: 0, refreshed: 0, unstuck: 0, kept: 0, reconciled: 0 };
  // cada entorno, solo sus pedidos: la preview no escribe a clientes reales ni toca sus pedidos; producción no recuerda
  // los de prueba (auditoría 26 oct, B1)
  const env = deps.env ?? process.env;
  const mine = (o: { sessionId?: string | null }) => orderBelongsToEnv(o.sessionId, env);
  // y se filtra ya en la consulta: los pedidos de prueba de la preview se acumulan y llenaban la ventana (revisión 26 oct)
  const live = env.VERCEL_ENV === "production";
  // una tapa dura pagada sin mandar a imprimir no tiene plazo (Álvaro, 26 oct; auditoría B3): el libro sigue abriéndose
  // hasta que se manda. El borrado ya la conservaba (`printPending`), pero el enlace dejaba de abrir a los 30 días
  // también la parada por una disputa: dura de 60 a 75 días y, si se gana, vuelve a esperar al padre (revisión 27 oct)
  for (const o of await store.listPrintOrders(["awaiting_approval", "failed", "canceled"], 500, live)) {
    if (!mine(o) || (o.printStatus === "canceled" && o.printError !== DISPUTE_HOLD)) continue;
    const book = await store.getBookById(o.bookId);
    if (!book?.expiresAt || Date.parse(book.expiresAt) - now.getTime() > 3 * 24 * HOUR) continue;
    await store.extendBook(book.id, new Date(now.getTime() + KEEP_FOR_PRINT_MS).toISOString());
    report.kept++;
  }
  for (const o of await store.listPrintOrders(["awaiting_approval"], 200, live)) {
    if (!mine(o)) continue;
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
  for (const o of await store.listPrintOrders(["sending"], 50, live)) {
    if (!mine(o)) continue;
    const book = await store.getBookById(o.bookId);
    if (!book || now.getTime() - Date.parse(o.updatedAt ?? o.createdAt) <= 15 * 60_000) continue;
    // `sending` sin terminar: la función se cortó. Antes de liberarlo se pregunta a la imprenta: si el pedido llegó, se da
    // por enviado; liberarlo haría que el padre lo mandara otra vez (I4). Si no se puede preguntar, se espera
    if (deps.mode === "gelato") {
      const there = await liveInPrinter(o, deps);
      if ("error" in there) {
        // sin poder preguntar, ni se libera ni se da por enviado: se vuelve a mirar en la próxima pasada, y soporte lo sabe
        await printAlert(store, deps, o, `no se ha podido preguntar a la imprenta (${there.error}); se vuelve a mirar en la próxima pasada`, "uncertain");
        continue;
      }
      if (there.many) await printAlert(store, deps, o, "hay más de un pedido vivo en Gelato para este libro", "duplicate");
      const alive = there.live;
      if (alive) {
        if (await store.claimPrint(o.id, ["sending"], "sent")) {
          const d = draftV2(book);
          await markSent(store, deps, o, book.email ?? "", d?.plan.title ?? "Tu libro", alive.id, now);
          report.reconciled++;
        }
        continue;
      }
    }
    // no llegó: se libera para que el padre lo reintente
    if (await store.claimPrint(o.id, ["sending"], "failed")) {
      await store.updateOrder(o.id, { printError: "interrumpido" });
      // también es un pedido que no ha salido hacia la imprenta (revisión 27 oct)
      await printAlert(store, deps, o, "interrumpido: la función se cortó mientras lo mandaba", "send");
      report.unstuck++;
    }
  }
  for (const o of await store.listPrintOrders(["sent", "in_production", "shipped"], 100, live)) {
    if (!mine(o)) continue;
    if ((await refreshPrint(store, o, deps)) === "updated") report.refreshed++;
  }
  return report;
}

/* ------------------------------ página de seguimiento ------------------------------ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lo que enseña /seguimiento/<id>: sin la dirección completa (solo la población) ni el enlace al libro. */
export interface TrackingView {
  ok: true;
  title: string;
  status: PrintStatus;
  city: string | null;
  paidAt: string;
  sentAt: string | null;
  info: PrintInfo;
  trackingUrl: string | null;
  coverUrl: string | null;
  /** Imprenta simulada (preview sin clave): no se imprime ni se envía nada. */
  simulated: boolean;
}

/** Si el pedido sigue abierto y no sabemos nada de la imprenta desde hace un rato, se le pregunta al abrir la página. */
const REFRESH_AFTER_MS = 30 * 60_000;

export async function trackingView(store: GenStore, orderId: unknown, deps?: PrintDeps): Promise<TrackingView | Fail> {
  if (typeof orderId !== "string" || !UUID.test(orderId)) return fail(404, "not_found");
  let order = await store.getOrderById(orderId);
  if (!order || order.edition !== "hardcover" || !order.printStatus) return fail(404, "not_found");
  const open = order.printStatus === "sent" || order.printStatus === "in_production" || order.printStatus === "shipped";
  // la última vez que se preguntó a la imprenta (25 oct): `checkedAt` se apunta aunque no cambie nada, para no llamar a
  // Gelato en cada visita mientras el pedido está días en el mismo estado
  const checked = Date.parse(order.info?.checkedAt ?? "");
  const last = Number.isFinite(checked) ? checked : Date.parse(order.sentAt ?? order.createdAt);
  const now = deps?.now?.() ?? new Date();
  if (deps && open && !(now.getTime() - last < REFRESH_AFTER_MS)) {
    const r = await refreshPrint(store, order, deps).catch(() => "skipped" as const);
    if (r !== "skipped") {
      const fresh = (await store.getOrderById(orderId)) ?? order;
      const info: PrintInfo = { ...(fresh.info ?? {}), checkedAt: now.toISOString() };
      await store.updateOrder(orderId, { info }).catch(() => null);
      order = { ...fresh, info };
    }
  }
  const book = await store.getBookById(order.bookId);
  if (!book) return fail(404, "not_found");
  // a los 30 días el borrado vacía el libro aunque el paquete siga de camino: la página sigue, sin título ni portada
  const d = draftV2(book);
  const view = d ? await bookView(store, book.public_id).catch(() => null) : null;
  const coverUrl = view && view.ok && view.chosen.cover ? (view.jobs.find((j) => j.id === view.chosen.cover)?.url ?? null) : null;
  return {
    ok: true,
    title: d?.plan.title ?? "Tu libro",
    status: order.printStatus ?? "sent",
    city: order.shipping?.city ?? null,
    paidAt: order.createdAt,
    sentAt: order.sentAt,
    info: order.info ?? {},
    trackingUrl: order.trackingUrl,
    coverUrl,
    simulated: !!order.printOrderId?.startsWith("dry-run"),
  };
}

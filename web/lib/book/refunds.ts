/**
 * Devoluciones y disputas de Stripe (auditoría 26 oct, I5). Antes el webhook las ignoraba: un libro devuelto seguía
 * descargándose y una tapa dura con disputa abierta se podía mandar a la imprenta.
 *
 * - `charge.refunded` entero (o una disputa perdida): el pedido pasa a `refunded`. Todo lo que lee pedidos pagados filtra
 *   `paid`, así que ya no abre la descarga ni la imprenta. Una tapa dura que no ha salido se cancela; si ya está en la
 *   imprenta, soporte tiene que pararla en Gelato.
 * - Devolución parcial: solo aviso (puede ser una compensación; el pedido sigue).
 * - `charge.dispute.created`: la tapa dura que no ha salido se para hasta que se resuelva; aviso con el plazo para
 *   responder. La descarga sigue: el dinero no se ha devuelto todavía.
 * - `charge.dispute.closed`: perdida, como una devolución entera; ganada (o consulta cerrada sin contracargo), la tapa
 *   dura parada vuelve a esperar a «Mandar a imprimir», salvo que el cobro ya se hubiera devuelto.
 * - Un libro con la mejora a tapa dura tiene dos pedidos (el PDF y la diferencia). Lo que pasa con uno mira también el
 *   otro (revisión 27 oct): si se devuelve o se disputa el cobro del PDF, la tapa dura de la mejora tampoco se imprime.
 * - Una devolución de un cobro sin pedido (el cobro doble o sin libro que soporte devuelve, B7) no avisa: es lo esperado.
 *
 * Los eventos traen el PaymentIntent, no la sesión de Checkout: se pregunta a Stripe (`sessionOf`).
 */
import type { GenStore } from "../generation/store";
import { DISPUTE_HOLD, REFUND_HOLD, type PaidOrder, type PrintStatus } from "../print/types";
import { orderBelongsToEnv } from "../stripe";
import { draftV2 } from "./service";

type Env = Record<string, string | undefined>;

export const CHARGE_EVENTS = ["charge.refunded", "charge.dispute.created", "charge.dispute.closed"] as const;

export function isChargeEvent(type: string): boolean {
  return (CHARGE_EVENTS as readonly string[]).includes(type);
}

/** Lo que usamos de un Charge (`charge.refunded`) o de un Dispute (`charge.dispute.*`). */
export interface ChargeEvent {
  type: string;
  data: {
    object: {
      id?: string;
      payment_intent?: string | null;
      charge?: string | null;
      amount?: number;
      amount_refunded?: number;
      refunded?: boolean;
      currency?: string | null;
      reason?: string | null;
      status?: string;
      metadata?: Record<string, string> | null;
      evidence_details?: { due_by?: number | null } | null;
    };
  };
}

export interface ChargeDeps {
  /** La sesión de Checkout del PaymentIntent (`sessionForPaymentIntent`). Lanza si hay que reintentar. */
  sessionOf: (paymentIntent: string) => Promise<{ id: string | null } | { error: string }>;
  env?: Env;
}

export { DISPUTE_HOLD };

/** Antes de salir hacia la imprenta: se puede parar. */
const HOLDABLE: PrintStatus[] = ["awaiting_approval", "failed"];
/** Ya en Gelato o saliendo hacia allí: solo se puede parar a mano. */
const AT_PRINTER: PrintStatus[] = ["sending", "sent", "in_production"];

/** El otro pedido del libro (la mejora a tapa dura o el PDF de base) y qué ha pasado con su tapa dura. */
type Linked = { orderId: string; edition: PaidOrder["edition"]; amountCents: number; print: PrintEffect | "reopened" };
type Found = {
  orderId: string;
  bookId: string | null;
  title: string;
  edition: PaidOrder["edition"];
  amountCents: number;
  /** Sigue habiendo un pedido pagado del libro: se sigue descargando. */
  stillPaid?: boolean;
  linked?: Linked | null;
};

/** Estados de `charge.dispute.closed` que no retiran el cobro: ganada, consulta cerrada o evitada. */
const DISPUTE_FAVORABLE = ["won", "warning_closed", "prevented"];

export type ChargeOutcome =
  | (Found & { action: "refunded"; via: "refund" | "dispute_lost"; print: PrintEffect })
  | (Found & { action: "partial_refund"; refundedCents: number })
  | (Found & { action: "disputed"; print: PrintEffect; dueBy: string | null; reason: string | null })
  /** `already_refunded`: se cerró a favor, pero el cobro ya se había devuelto: no se reabre nada. */
  | (Found & { action: "dispute_won"; print: "reopened" | "none" | "already_refunded" })
  /**
   * El mismo cambio otra vez (Stripe reintenta o manda dos eventos): nada que hacer. `seen`: lo que se avisó la primera
   * vez, rehecho con lo que hay en la base, para volver a avisar. Stripe solo reintenta si la vez anterior falló (el
   * aviso no salió o la base falló a medias), así que el aviso no se pierde (revisión 27 oct).
   */
  | { action: "duplicate"; orderId: string; seen?: Announced }
  /** No sabemos de qué pedido es: aviso a soporte con lo que trae el evento. */
  | { action: "unmatched"; reason: string }
  | { action: "ignored"; reason: string };

/** Qué ha pasado con la tapa dura: parada aquí, ya en la imprenta (a mano) o nada que parar. */
type PrintEffect = "held" | "at_printer" | "none";

/** Los cambios que se avisan a soporte. */
type Announced = Extract<ChargeOutcome, { action: "refunded" | "disputed" }>;

/** Como `holdPrint`, pero sin tocar nada: lo que quedó de la primera vez. */
function printNow(order: PaidOrder, why: string): PrintEffect {
  if (order.edition !== "hardcover" || !order.printStatus) return "none";
  if (order.printStatus === "canceled" && order.printError === why) return "held";
  return AT_PRINTER.includes(order.printStatus) ? "at_printer" : "none";
}

/** Como `holdLinked`, sin tocar nada. */
async function linkedNow(store: GenStore, order: PaidOrder, why: string): Promise<Linked | null> {
  const other = await otherPaid(store, order);
  return other ? { orderId: other.id, edition: other.edition, amountCents: other.amountCents, print: printNow(other, why) } : null;
}

/** Lo que se avisó al registrar la devolución (o la disputa perdida), rehecho para un reintento. */
async function refundedAgain(store: GenStore, found: Found, order: PaidOrder, via: "refund" | "dispute_lost"): Promise<Announced> {
  const linked = await linkedNow(store, order, REFUND_HOLD);
  return { ...found, action: "refunded", via, print: printNow(order, REFUND_HOLD), linked, stillPaid: !!linked };
}

async function holdPrint(store: GenStore, order: PaidOrder, why: string): Promise<PrintEffect> {
  if (order.edition !== "hardcover" || !order.printStatus) return "none";
  if (HOLDABLE.includes(order.printStatus)) {
    // con el mismo bloqueo que «Mandar a imprimir»: si a la vez sale hacia la imprenta, gana uno de los dos
    if (await store.claimPrint(order.id, HOLDABLE, "canceled")) {
      await store.updateOrder(order.id, { printError: why });
      return "held";
    }
    const now = await store.getOrderById(order.id);
    return now?.printStatus && AT_PRINTER.includes(now.printStatus) ? "at_printer" : "none";
  }
  return AT_PRINTER.includes(order.printStatus) ? "at_printer" : "none";
}

/**
 * El otro pedido pagado del mismo libro, si lo hay: la mejora a tapa dura del PDF devuelto, o el PDF de la mejora.
 * `getOrder` da el pagado más reciente; con este ya marcado como devuelto, es el otro.
 */
async function otherPaid(store: GenStore, order: PaidOrder): Promise<PaidOrder | null> {
  const o = await store.getOrder(order.bookId);
  return o && o.id !== order.id ? o : null;
}

/** Para el otro pedido: su tapa dura, si la tiene y aún no ha salido, también se para. */
async function holdLinked(store: GenStore, order: PaidOrder, why: string): Promise<Linked | null> {
  const other = await otherPaid(store, order);
  if (!other) return null;
  return { orderId: other.id, edition: other.edition, amountCents: other.amountCents, print: await holdPrint(store, other, why) };
}

/** Vuelve a «Mandar a imprimir» una tapa dura que paramos por una disputa, si su pedido sigue pagado. */
async function releaseDisputeHold(store: GenStore, order: PaidOrder): Promise<boolean> {
  if ((order.status ?? "paid") !== "paid" || order.printStatus !== "canceled" || order.printError !== DISPUTE_HOLD) return false;
  if (!(await store.claimPrint(order.id, ["canceled"], "awaiting_approval"))) return false;
  await store.updateOrder(order.id, { printError: null });
  return true;
}

export async function recordChargeEvent(store: GenStore, event: ChargeEvent, deps: ChargeDeps): Promise<ChargeOutcome> {
  if (!isChargeEvent(event.type)) return { action: "ignored", reason: event.type };
  const o = event.data?.object ?? {};
  const pi = typeof o.payment_intent === "string" ? o.payment_intent : null;
  if (!pi) return { action: "unmatched", reason: "sin payment_intent" };
  const session = await deps.sessionOf(pi);
  if ("error" in session) return { action: "unmatched", reason: `no se puede leer la sesión en Stripe (${session.error})` };
  if (!session.id) return { action: "unmatched", reason: "Stripe no tiene sesión de Checkout para este cobro" };
  const order = await store.getOrderBySession(session.id);
  if (!order) {
    // el cobro doble o sin libro que soporte devuelve a mano no tiene pedido: es lo esperado (revisión 27 oct)
    if (event.type === "charge.refunded") return { action: "ignored", reason: `devolución de un cobro sin pedido (sesión ${session.id})` };
    return { action: "unmatched", reason: `sin pedido para la sesión ${session.id}` };
  }
  // la base es la misma en la preview y en producción: cada entorno solo toca sus pedidos (B1)
  if (!orderBelongsToEnv(order.sessionId, deps.env)) return { action: "ignored", reason: "otro entorno" };

  const book = await store.getBookById(order.bookId).catch(() => null);
  const found: Found = {
    orderId: order.id,
    bookId: book?.public_id ?? null,
    title: (book ? draftV2(book) : null)?.plan.title ?? "libro",
    edition: order.edition,
    amountCents: order.amountCents,
  };
  const refunded = order.status === "refunded";

  if (event.type === "charge.refunded") {
    const total = o.amount ?? order.amountCents;
    const full = o.refunded === true || (typeof o.amount_refunded === "number" && o.amount_refunded >= total);
    if (!full) return { ...found, action: "partial_refund", refundedCents: o.amount_refunded ?? 0 };
    if (refunded) return { action: "duplicate", orderId: order.id, seen: await refundedAgain(store, found, order, "refund") };
    await store.updateOrder(order.id, { status: "refunded" });
    const print = await holdPrint(store, order, REFUND_HOLD);
    const linked = await holdLinked(store, order, REFUND_HOLD);
    return { ...found, action: "refunded", via: "refund", print, linked, stillPaid: !!linked };
  }

  if (event.type === "charge.dispute.created") {
    const due = o.evidence_details?.due_by;
    const dispute = { dueBy: typeof due === "number" ? new Date(due * 1000).toISOString() : null, reason: o.reason ?? null };
    if (order.printStatus === "canceled" && order.printError === DISPUTE_HOLD) {
      return { action: "duplicate", orderId: order.id, seen: { ...found, action: "disputed", print: "held", linked: await linkedNow(store, order, DISPUTE_HOLD), ...dispute } };
    }
    const print = await holdPrint(store, order, DISPUTE_HOLD);
    return { ...found, action: "disputed", print, linked: await holdLinked(store, order, DISPUTE_HOLD), ...dispute };
  }

  // charge.dispute.closed
  if (o.status === "lost") {
    if (refunded) return { action: "duplicate", orderId: order.id, seen: await refundedAgain(store, found, order, "dispute_lost") };
    await store.updateOrder(order.id, { status: "refunded" });
    const print = await holdPrint(store, order, REFUND_HOLD);
    const linked = await holdLinked(store, order, REFUND_HOLD);
    return { ...found, action: "refunded", via: "dispute_lost", print, linked, stillPaid: !!linked };
  }
  if (!DISPUTE_FAVORABLE.includes(o.status ?? "")) return { action: "ignored", reason: `disputa cerrada con estado ${o.status ?? "?"}` };
  // a favor: la tapa dura que paramos vuelve a esperar al padre. Si entretanto se devolvió el cobro, se queda como está
  // (revisión 27 oct: una consulta cerrada después de devolver el dinero reabría la tapa dura)
  if (refunded) return { ...found, action: "dispute_won", print: "already_refunded" };
  const reopened = await releaseDisputeHold(store, order);
  const other = await otherPaid(store, order);
  const linked: Linked | null = other && (await releaseDisputeHold(store, other)) ? { orderId: other.id, edition: other.edition, amountCents: other.amountCents, print: "reopened" } : null;
  return { ...found, action: "dispute_won", print: reopened ? "reopened" : "none", linked };
}

const money = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
const dateEs = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });

/** Aviso a soporte (`MAIL_FORWARD_TO`). Puro, para probarlo; lo manda el webhook. null: nada que contar. */
export function chargeNotice(r: ChargeOutcome, event: ChargeEvent): { subject: string; text: string } | null {
  const o = event.data?.object ?? {};
  const where = (f: Found) => [`Pedido: ${f.orderId} (${f.edition === "hardcover" ? "tapa dura" : "PDF"}, ${money(f.amountCents)})`, ...(f.bookId ? [] : ["El libro ya no está."])].join("\n");
  const printLine = (p: PrintEffect, held: string) =>
    p === "held" ? held : p === "at_printer" ? "Ojo: la tapa dura ya está en la imprenta o saliendo hacia ella. Compruébalo en Gelato y cancélala si aún se puede." : null;
  const paidWord = (l: Linked) => (l.edition === "hardcover" ? "pagada" : "pagado");
  const otherOrder = (l: Linked) => `${l.edition === "hardcover" ? "la mejora a tapa dura" : "el PDF"} (pedido ${l.orderId}, ${money(l.amountCents)})`;
  // el otro pedido del libro (mejora a tapa dura): qué le ha pasado
  const linkedLine = (l: Linked | null | undefined, held: string) =>
    !l
      ? null
      : l.print === "held"
        ? `El libro tiene también ${otherOrder(l)}, que sigue ${paidWord(l)}. ${held}`
        : l.print === "at_printer"
          ? `El libro tiene también ${otherOrder(l)}, y su tapa dura ya está en la imprenta o saliendo hacia ella. Compruébalo en Gelato.`
          : l.print === "reopened"
            ? `La tapa dura de la mejora (pedido ${l.orderId}, ${money(l.amountCents)}) vuelve a esperar a «Mandar a imprimir».`
            : `El libro tiene también ${otherOrder(l)}, que sigue ${paidWord(l)}.`;
  switch (r.action) {
    case "refunded":
      return {
        subject: `${r.via === "refund" ? "Devolución" : "Disputa perdida"}: «${r.title}»`,
        text: [
          r.via === "refund" ? "Stripe ha devuelto el cobro entero." : "La disputa se ha cerrado en contra: Stripe ha retirado el cobro.",
          r.stillPaid ? "El pedido queda como devuelto." : "El pedido queda como devuelto: el libro ya no se descarga ni se manda a imprimir.",
          printLine(r.print, "La tapa dura no había salido: queda cancelada."),
          linkedLine(r.linked, "Su tapa dura no había salido y queda parada: decide a mano si se devuelve también o se imprime. Mientras, el libro se sigue descargando."),
          r.stillPaid && r.linked?.edition === "illustrated" ? "El libro se sigue descargando: el PDF está pagado." : null,
          where(r),
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    case "partial_refund":
      return {
        subject: `Devolución parcial: «${r.title}»`,
        text: [`Se han devuelto ${money(r.refundedCents)} de ${money(o.amount ?? r.amountCents)}. El pedido sigue pagado: si hay que pararlo, hazlo a mano.`, where(r)].join("\n\n"),
      };
    case "disputed":
      return {
        subject: `Disputa abierta: «${r.title}»`,
        text: [
          `El cliente ha abierto una disputa${r.reason ? ` (${r.reason})` : ""}. Respóndela en el panel de Stripe${r.dueBy ? ` antes del ${dateEs(r.dueBy)}` : ""}.`,
          printLine(r.print, "La tapa dura no había salido: queda parada hasta que se resuelva. Si se gana, vuelve a esperar a «Mandar a imprimir»."),
          linkedLine(r.linked, "Su tapa dura no había salido: queda parada hasta que se resuelva."),
          "La descarga sigue abierta mientras tanto.",
          where(r),
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    case "dispute_won":
      return {
        subject: `Disputa cerrada a favor: «${r.title}»`,
        text: [
          r.print === "reopened"
            ? "La tapa dura que estaba parada vuelve a esperar a que el padre la mande a imprimir."
            : r.print === "already_refunded"
              ? "El cobro ya se había devuelto: no se reabre nada."
              : r.linked
                ? null
                : "No había nada parado.",
          linkedLine(r.linked, ""),
          where(r),
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    case "duplicate":
      return r.seen ? chargeNotice(r.seen, event) : null;
    case "unmatched":
      return {
        subject: "Devolución o disputa sin pedido",
        text: [
          `Ha llegado ${event.type} y no sabemos de qué pedido es: ${r.reason}.`,
          `PaymentIntent: ${o.payment_intent ?? "?"}\nCobro: ${o.charge ?? o.id ?? "?"}\nLibro (metadatos): ${o.metadata?.bookId ?? "?"}\nImporte: ${typeof o.amount === "number" ? money(o.amount) : "?"}`,
          "Búscalo en el panel de Stripe y, si hace falta, márcalo a mano.",
        ].join("\n\n"),
      };
    default:
      return null;
  }
}

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
 * - `charge.dispute.closed`: perdida, como una devolución entera; ganada, la tapa dura parada vuelve a esperar a
 *   «Mandar a imprimir».
 *
 * Los eventos traen el PaymentIntent, no la sesión de Checkout: se pregunta a Stripe (`sessionOf`).
 */
import type { GenStore } from "../generation/store";
import type { PaidOrder, PrintStatus } from "../print/types";
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

/** Marca de la tapa dura parada por una disputa (print_error): al ganarla se sabe que la paramos nosotros. */
export const DISPUTE_HOLD = "disputa abierta";
const REFUND_HOLD = "devuelto";

/** Antes de salir hacia la imprenta: se puede parar. */
const HOLDABLE: PrintStatus[] = ["awaiting_approval", "failed"];
/** Ya en Gelato o saliendo hacia allí: solo se puede parar a mano. */
const AT_PRINTER: PrintStatus[] = ["sending", "sent", "in_production"];

type Found = { orderId: string; bookId: string | null; title: string; edition: PaidOrder["edition"]; amountCents: number };

export type ChargeOutcome =
  | (Found & { action: "refunded"; via: "refund" | "dispute_lost"; print: PrintEffect })
  | (Found & { action: "partial_refund"; refundedCents: number })
  | (Found & { action: "disputed"; print: PrintEffect; dueBy: string | null; reason: string | null })
  | (Found & { action: "dispute_won"; print: "reopened" | "none" })
  /** El mismo cambio otra vez (Stripe reintenta o manda dos eventos): nada que hacer ni que avisar. */
  | { action: "duplicate"; orderId: string }
  /** No sabemos de qué pedido es: aviso a soporte con lo que trae el evento. */
  | { action: "unmatched"; reason: string }
  | { action: "ignored"; reason: string };

/** Qué ha pasado con la tapa dura: parada aquí, ya en la imprenta (a mano) o nada que parar. */
type PrintEffect = "held" | "at_printer" | "none";

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

export async function recordChargeEvent(store: GenStore, event: ChargeEvent, deps: ChargeDeps): Promise<ChargeOutcome> {
  if (!isChargeEvent(event.type)) return { action: "ignored", reason: event.type };
  const o = event.data?.object ?? {};
  const pi = typeof o.payment_intent === "string" ? o.payment_intent : null;
  if (!pi) return { action: "unmatched", reason: "sin payment_intent" };
  const session = await deps.sessionOf(pi);
  if ("error" in session) return { action: "unmatched", reason: `no se puede leer la sesión en Stripe (${session.error})` };
  if (!session.id) return { action: "unmatched", reason: "Stripe no tiene sesión de Checkout para este cobro" };
  const order = await store.getOrderBySession(session.id);
  if (!order) return { action: "unmatched", reason: `sin pedido para la sesión ${session.id}` };
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
    if (refunded) return { action: "duplicate", orderId: order.id };
    await store.updateOrder(order.id, { status: "refunded" });
    return { ...found, action: "refunded", via: "refund", print: await holdPrint(store, order, REFUND_HOLD) };
  }

  if (event.type === "charge.dispute.created") {
    if (order.printStatus === "canceled" && order.printError === DISPUTE_HOLD) return { action: "duplicate", orderId: order.id };
    const due = o.evidence_details?.due_by;
    return {
      ...found,
      action: "disputed",
      print: await holdPrint(store, order, DISPUTE_HOLD),
      dueBy: typeof due === "number" ? new Date(due * 1000).toISOString() : null,
      reason: o.reason ?? null,
    };
  }

  // charge.dispute.closed
  if (o.status === "lost") {
    if (refunded) return { action: "duplicate", orderId: order.id };
    await store.updateOrder(order.id, { status: "refunded" });
    return { ...found, action: "refunded", via: "dispute_lost", print: await holdPrint(store, order, REFUND_HOLD) };
  }
  // ganada (o cerrada sin llegar a contracargo): la tapa dura que paramos vuelve a esperar al padre
  if (order.printStatus === "canceled" && order.printError === DISPUTE_HOLD && (await store.claimPrint(order.id, ["canceled"], "awaiting_approval"))) {
    await store.updateOrder(order.id, { printError: null });
    return { ...found, action: "dispute_won", print: "reopened" };
  }
  return { ...found, action: "dispute_won", print: "none" };
}

const money = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
const dateEs = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" });

/** Aviso a soporte (`MAIL_FORWARD_TO`). Puro, para probarlo; lo manda el webhook. null: nada que contar. */
export function chargeNotice(r: ChargeOutcome, event: ChargeEvent, link: (publicId: string) => string): { subject: string; text: string } | null {
  const o = event.data?.object ?? {};
  const where = (f: Found) => [`Pedido: ${f.orderId} (${f.edition === "hardcover" ? "tapa dura" : "PDF"}, ${money(f.amountCents)})`, f.bookId ? `Libro: ${link(f.bookId)}` : "El libro ya no está."].join("\n");
  const printLine = (p: PrintEffect, held: string) =>
    p === "held" ? held : p === "at_printer" ? "Ojo: la tapa dura ya está en la imprenta o saliendo hacia ella. Cancélala en Gelato si aún se puede." : null;
  switch (r.action) {
    case "refunded":
      return {
        subject: `${r.via === "refund" ? "Devolución" : "Disputa perdida"}: «${r.title}»`,
        text: [
          r.via === "refund" ? "Stripe ha devuelto el cobro entero." : "La disputa se ha cerrado en contra: Stripe ha retirado el cobro.",
          "El pedido queda como devuelto: el libro ya no se descarga ni se manda a imprimir.",
          printLine(r.print, "La tapa dura no había salido: queda cancelada."),
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
          "La descarga sigue abierta mientras tanto.",
          where(r),
        ]
          .filter(Boolean)
          .join("\n\n"),
      };
    case "dispute_won":
      return {
        subject: `Disputa cerrada a favor: «${r.title}»`,
        text: [r.print === "reopened" ? "La tapa dura que estaba parada vuelve a esperar a que el padre la mande a imprimir." : "No había nada parado.", where(r)].join("\n\n"),
      };
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

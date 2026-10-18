/**
 * Libro impreso (B8, D7): tipos compartidos entre el pago, la imprenta y la interfaz. Sin dependencias de servidor.
 */

/** Ediciones que se pueden comprar en el paso 5. */
export type PaidEdition = "hardcover" | "illustrated";

/** Dirección de envío ya validada (cleanShipping). Solo España peninsular y Baleares por ahora. */
export interface Shipping {
  /** Nombre y apellidos de quien recibe. */
  name: string;
  line1: string;
  line2?: string;
  postcode: string;
  city: string;
  province?: string;
  country: "ES";
  phone?: string;
}

/**
 * Estado del libro impreso en cuentos_orders.print_status:
 * - awaiting_approval: pagado; el padre revisa las páginas y todavía no lo ha mandado a imprimir.
 * - sending: maquetando el PDF y creando el pedido en la imprenta (unos segundos).
 * - sent … returned: lo que dice la imprenta (Gelato) del pedido.
 * - failed: no se pudo crear el pedido o la imprenta lo rechazó (se puede reintentar).
 */
export type PrintStatus = "awaiting_approval" | "sending" | "sent" | "in_production" | "shipped" | "delivered" | "returned" | "canceled" | "failed";

export const OPEN_PRINT_STATUSES: PrintStatus[] = ["awaiting_approval", "sending", "sent", "in_production", "shipped"];

/** Ya en la imprenta: el libro no admite cambios. */
export const LOCKED_PRINT_STATUSES: PrintStatus[] = ["sending", "sent", "in_production", "shipped", "delivered", "returned"];

export interface PaidOrder {
  id: string;
  bookId: string;
  edition: PaidEdition;
  amountCents: number;
  shipping: Shipping | null;
  printStatus: PrintStatus | null;
  printOrderId: string | null;
  trackingUrl: string | null;
  printError: string | null;
  sentAt: string | null;
  remindedAt: string | null;
  shippedMailedAt: string | null;
  createdAt: string;
  /** Último cambio del estado de imprenta (print_updated_at). */
  updatedAt: string | null;
}

/** Lo que ve el padre en el paso 5 tras pagar la tapa dura (sin el resto del pedido). */
export interface PrintView {
  status: PrintStatus;
  shipping: Shipping | null;
  trackingUrl: string | null;
  sentAt: string | null;
  /** La imprenta funciona de verdad aquí (con clave), o es una simulación de la preview. */
  mode: "gelato" | "dry-run" | "none";
}

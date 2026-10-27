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

/**
 * Ya en la imprenta, o parada por una devolución o una disputa (`canceled`, revisión 27 oct): el libro no admite cambios.
 * Durante una disputa no se piden versiones nuevas.
 */
export const LOCKED_PRINT_STATUSES: PrintStatus[] = ["sending", "sent", "in_production", "shipped", "delivered", "returned", "canceled"];

/**
 * Marca (print_error) de la tapa dura parada por una disputa de Stripe (I5): al ganarla se sabe que la paramos nosotros, y
 * mientras dura el libro se conserva (una disputa tarda de 60 a 75 días).
 */
export const DISPUTE_HOLD = "disputa abierta";
/** Marca de la tapa dura cancelada porque se devolvió el cobro (I5). */
export const REFUND_HOLD = "devuelto";

/** Los hitos que se fechan en la página de seguimiento. */
export type PrintStep = "sent" | "in_production" | "shipped" | "delivered";

/**
 * Lo que sabemos del envío para la página de seguimiento (cuentos_orders.print_info, 24 oct). Lo rellenan el aviso de
 * Gelato y el cron; Gelato no da el historial, así que la fecha de cada hito es cuándo lo vimos por primera vez.
 */
export interface PrintInfo {
  method?: string | null;
  etaFrom?: string | null;
  etaTo?: string | null;
  trackingCode?: string | null;
  steps?: Partial<Record<PrintStep, string>>;
  /** Última vez que se preguntó a la imprenta desde la página de seguimiento (aunque no cambiara nada). */
  checkedAt?: string | null;
  /**
   * El email de «ya está en la imprenta» está pendiente: se pone al pasar a `sent` y se quita cuando sale o cuando el fallo
   * no tiene arreglo. Mientras está, el cron diario lo reintenta (hasta una semana).
   */
  sentMailPending?: boolean | null;
}

/** cuentos_orders.status. Todo lo que lee pedidos pagados filtra `paid`: uno `refunded` ya no abre descargas ni imprenta (I5). */
export type OrderStatus = "pending" | "paid" | "refunded" | "cancelled";

export interface PaidOrder {
  id: string;
  /** Sin valor en los pedidos de antes: se leen como pagados. */
  status?: OrderStatus;
  bookId: string;
  edition: PaidEdition;
  amountCents: number;
  /** Sesión de Stripe (`cs_live_…`, `cs_test_…`) o `dry-run:…` del pago de prueba. */
  sessionId?: string | null;
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
  /** print_info: método, entrega estimada, número de seguimiento y fecha de cada hito. */
  info: PrintInfo | null;
}

/** Lo que ve el padre en el paso 5 tras pagar la tapa dura (sin el resto del pedido). */
/**
 * Lo que la pantalla enseña de la dirección (auditoría 26 oct, I16): el enlace del libro se reenvía a la familia, así que
 * la vista no lleva ni la calle ni el teléfono. La dirección entera va en los emails del pedido, al buzón de quien pagó.
 */
export interface ShippingSummary {
  name: string;
  postcode: string;
  city: string;
  province?: string;
}

export interface PrintView {
  status: PrintStatus;
  shipping: ShippingSummary | null;
  trackingUrl: string | null;
  sentAt: string | null;
  /** Página propia de seguimiento (/seguimiento/<id del pedido>), desde que está en la imprenta. */
  trackPath: string | null;
  /** La imprenta funciona de verdad aquí (con clave), o es una simulación de la preview. */
  mode: "gelato" | "dry-run" | "none";
}

import "server-only";
import type { PrintDeps } from "../book/print";
import { renderPrintPdf } from "../pdf/print";
import { sendPrintReminder, sendSentToPrint, sendShipped } from "../mail";
import { coverGeometry, createGelatoOrder, estimatedCover, gelatoOrderType, gelatoPageCount, getGelatoOrder, gelatoShipmentMethod, printMode, productSize, resolveProductUid } from "./gelato";

/** Dependencias reales del libro impreso (Gelato, Chromium, Resend) para las rutas. `origin` da los enlaces de los emails. */
export function printDeps(origin: string): PrintDeps {
  return {
    mode: printMode(),
    orderType: gelatoOrderType(),
    shipmentMethod: gelatoShipmentMethod(),
    pageCount: gelatoPageCount(),
    resolveProductUid: () => resolveProductUid(),
    productSize: (uid) => productSize(uid),
    coverGeometry: (uid, n) => coverGeometry(uid, n),
    estimatedCover,
    render: async (input, size, cover) => (await renderPrintPdf(input, size, cover)).pdf,
    createOrder: (i) => createGelatoOrder(i),
    getOrder: (id) => getGelatoOrder(id),
    mail: { sentToPrint: sendSentToPrint, shipped: sendShipped, reminder: sendPrintReminder },
    link: (id) => `${origin}/crear?b=${id}`,
    trackLink: (orderId) => `${origin}/seguimiento/${orderId}`,
  };
}

/** Cron de Vercel: `Authorization: Bearer $CRON_SECRET`. Sin secreto, solo en local (ver lib/cronAuth.ts). */
export { cronAuthorized } from "../cronAuth";

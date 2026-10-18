import "server-only";
import type { PrintDeps } from "../book/print";
import { renderPrintPdf } from "../pdf/print";
import { sendPrintReminder, sendSentToPrint, sendShipped } from "../mail";
import { coverGeometry, createGelatoOrder, estimatedCover, gelatoOrderType, gelatoPageCount, getGelatoOrder, printMode, productSize, resolveProductUid } from "./gelato";

/** Dependencias reales del libro impreso (Gelato, Chromium, Resend) para las rutas. `origin` da los enlaces de los emails. */
export function printDeps(origin: string): PrintDeps {
  return {
    mode: printMode(),
    orderType: gelatoOrderType(),
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
  };
}

/** Cron de Vercel: `Authorization: Bearer $CRON_SECRET`. Sin secreto, solo fuera de producción. */
export function cronAuthorized(req: Request): "ok" | "unauthorized" | "missing" {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}` ? "ok" : "unauthorized";
  return process.env.VERCEL_ENV === "production" ? "missing" : "ok";
}

import "server-only";
import { sendBookReady } from "../mail";
import { printMode } from "../print/gelato";
import type { PaidEdition } from "../print/types";
import type { UpgradeOffer } from "./service";

/**
 * El email de «tu libro está listo» de las rutas. La oferta de pasar a tapa dura solo va si aquí hay imprenta: sin ella,
 * el enlace llevaría a un libro que no la ofrece.
 */
export function readyMail(to: string, title: string, link: string, edition: PaidEdition, upgrade?: UpgradeOffer | null, key?: string) {
  return sendBookReady(to, title, link, edition, printMode() !== "none" ? upgrade : null, key);
}

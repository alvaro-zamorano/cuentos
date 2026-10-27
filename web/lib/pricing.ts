import { PRICE_CENTS, eur } from "./print/prices";
import type { Edition } from "./types";

/**
 * Precios de las ediciones (IVA incluido), como texto. Salen de los céntimos que se cobran (lib/print/prices.ts): un
 * cambio allí cambia también lo que se enseña (menores de la auditoría 26 oct). Hipótesis PRD §10.
 */
export const PRICE_CLASSIC = "Gratis";
export const PRICE_ILLUSTRATED = eur(PRICE_CENTS.illustrated);
// D7 (18 oct): tapa dura con envío y el PDF incluido
export const PRICE_HARDCOVER = eur(PRICE_CENTS.hardcover);

export const EDITION_PRICE: Record<Edition, string> = {
  classic: PRICE_CLASSIC,
  illustrated: PRICE_ILLUSTRATED,
  hardcover: PRICE_HARDCOVER,
};

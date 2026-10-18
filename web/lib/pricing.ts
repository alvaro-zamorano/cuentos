import type { Edition } from "./types";

/**
 * Precios de las ediciones (IVA incluido). Hipótesis PRD §10: sin validar con ventas reales.
 * Se muestran como texto; el cobro usa lib/print/prices.ts.
 */
export const PRICE_CLASSIC = "Gratis"; // hipótesis PRD §10
export const PRICE_ILLUSTRATED = "14,90 €"; // hipótesis PRD §10
export const PRICE_HARDCOVER = "34,90 €"; // D7 (18 oct): tapa dura con envío y el PDF incluido

export const EDITION_PRICE: Record<Edition, string> = {
  classic: PRICE_CLASSIC,
  illustrated: PRICE_ILLUSTRATED,
  hardcover: PRICE_HARDCOVER,
};

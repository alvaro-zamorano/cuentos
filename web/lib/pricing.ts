import type { Edition } from "./types";

/**
 * Precios de las ediciones (IVA incluido). Hipótesis PRD §10: sin validar con ventas reales.
 * Se muestran como texto; no hay cobro real (el pago de la edición ilustrada es de prueba con NEXT_PUBLIC_DRY_RUN_PAYMENT=1).
 */
export const PRICE_CLASSIC = "Gratis"; // hipótesis PRD §10
export const PRICE_ILLUSTRATED = "14,90 €"; // hipótesis PRD §10
export const PRICE_HARDCOVER = "desde 39,90 €"; // hipótesis PRD §10

export const EDITION_PRICE: Record<Edition, string> = {
  classic: PRICE_CLASSIC,
  illustrated: PRICE_ILLUSTRATED,
  hardcover: PRICE_HARDCOVER,
};

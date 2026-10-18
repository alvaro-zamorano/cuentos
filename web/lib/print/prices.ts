import type { PaidEdition } from "./types";

/**
 * Precios del paso 5 (IVA incluido, D7 y decisión de Álvaro del 18 oct): el libro de tapa dura con envío a la Península
 * y Baleares y el PDF incluido, o solo el PDF. Sin dependencias de servidor: los usan el pago y la interfaz.
 */
export const PRICE_CENTS: Record<PaidEdition, number> = { hardcover: 3490, illustrated: 1490 };

export const eur = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

export const EDITION_LABEL: Record<PaidEdition, string> = { hardcover: "Libro de tapa dura", illustrated: "Libro ilustrado en PDF" };

export function paidEdition(v: unknown): PaidEdition | null {
  return v === "hardcover" || v === "illustrated" ? v : null;
}

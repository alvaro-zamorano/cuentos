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

/**
 * Pasar a tapa dura después de comprar el PDF (24 oct, Álvaro): se paga solo la diferencia. Se puede mientras el libro
 * esté guardado (30 días desde que se creó) y se cierra un día antes de que caduque, para que un pago a medias no llegue
 * cuando el borrado ya se ha llevado las ilustraciones.
 */
export const UPGRADE_CENTS = PRICE_CENTS.hardcover - PRICE_CENTS.illustrated;
export const UPGRADE_CLOSES_BEFORE_MS = 24 * 3600 * 1000;

/** Último momento para pasar a tapa dura, o null si ya no se puede (o no se sabe cuándo caduca el libro). */
export function upgradeDeadline(expiresAt: string | null | undefined, now = Date.now()): string | null {
  const exp = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(exp)) return null;
  const until = exp - UPGRADE_CLOSES_BEFORE_MS;
  return until > now ? new Date(until).toISOString() : null;
}

/** «12 de noviembre», en hora de Madrid. */
export const dayMonth = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "Europe/Madrid" });

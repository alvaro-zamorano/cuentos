/**
 * Cuentos con dibujos gratis por persona (26 oct, Álvaro): cada email puede empezar 3 cuentos con dibujos (hoja y
 * portada) sin pagar cada 30 días; al comprar un libro, la cuenta vuelve a empezar. Se mira en la puerta (antes de
 * dibujar), nunca a mitad: un cuento que empieza siempre termina, con su presupuesto propio (FREE_BOOK_CAP_CENTS).
 *
 * El email no está verificado: los libros nunca se enseñan en pantalla, se mandan por email.
 */
import type { BookRecord, GenStore } from "../generation/store";

export const FREE_BOOKS = 3;
export const FREE_WINDOW_DAYS = 30;
const DAY = 24 * 3600 * 1000;

/** El mismo buzón escrito de otra forma cuenta igual: mayúsculas, puntos de Gmail y alias `+algo`. */
export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

export interface FreeUse {
  /** Cuentos con dibujos empezados sin pagar en el periodo (sin contar el actual). */
  used: number;
  /** Cuántos quedan contando el actual (0 = este es el último). */
  left: number;
  /** Desde cuándo se cuenta: hace 30 días o la última compra, lo más reciente. */
  since: string;
  /** Los libros que cuentan, para mandarlos por email (nunca a la pantalla). */
  books: BookRecord[];
}

/** Libros del mismo buzón que ya tienen dibujos y no se han pagado, en el periodo. `exceptBookId`: el que se está creando. */
export async function freeUse(store: GenStore, email: string, opts: { exceptBookId?: string | null; now?: number } = {}): Promise<FreeUse> {
  const now = opts.now ?? Date.now();
  const norm = normalizeEmail(email);
  const domain = norm.slice(norm.lastIndexOf("@") + 1);
  const windowStart = now - FREE_WINDOW_DAYS * DAY;
  const recent = (await store.listBooksByEmailDomain(domain, new Date(windowStart).toISOString())).filter((b) => b.email && normalizeEmail(b.email) === norm);

  // la última compra del mismo buzón abre otra tanda
  let since = windowStart;
  const unpaidWithArt: BookRecord[] = [];
  for (const b of recent) {
    const order = await store.getOrder(b.id);
    if (order) {
      since = Math.max(since, Date.parse(order.createdAt));
      continue;
    }
    if (b.id === opts.exceptBookId || b.public_id === opts.exceptBookId) continue;
    const jobs = await store.listJobs(b.id);
    if (jobs.some((j) => j.kind === "sheet")) unpaidWithArt.push(b);
  }
  const books = unpaidWithArt.filter((b) => Date.parse(b.createdAt ?? new Date(now).toISOString()) >= since);
  return { used: books.length, left: Math.max(0, FREE_BOOKS - books.length - 1), since: new Date(since).toISOString(), books };
}

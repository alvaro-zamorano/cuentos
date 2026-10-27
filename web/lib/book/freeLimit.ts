/**
 * Cuentos con dibujos gratis por persona (26 oct, Álvaro): cada email puede empezar 3 cuentos con dibujos (hoja y
 * portada) sin pagar cada 30 días; al comprar un libro, la cuenta vuelve a empezar. Se mira en la puerta (antes de
 * dibujar), nunca a mitad: un cuento que empieza siempre termina, con su presupuesto propio (FREE_BOOK_CAP_CENTS).
 *
 * El email no está verificado: los libros nunca se enseñan en pantalla, se mandan por email.
 *
 * Auditoría 26 oct, I7: se cuenta por `cuentos_books.email_norm` (columna con índice, migración 0013), sin leer los
 * borradores, y la puerta se pasa con un bloqueo por buzón (`passFreeGate`): varias peticiones a la vez con el mismo
 * email se cuentan una detrás de otra, y el libro que pasa queda marcado (`free_claimed_at`) antes de soltar el bloqueo.
 */
import { createHash } from "node:crypto";
import type { FreeBook, GenStore } from "../generation/store";
import { normalizeEmail } from "../emailNorm";
import { paidInEnv } from "../stripe";

export { normalizeEmail };

export const FREE_BOOKS = 3;
export const FREE_WINDOW_DAYS = 30;
const DAY = 24 * 3600 * 1000;
/**
 * Un libro que ha pasado la puerta cuenta aunque aún no tenga hoja: la dirección de arte (una llamada al modelo) va antes.
 * Si en este tiempo no llega a tener personajes (falló antes de pintar), deja de contar.
 */
export const CLAIM_TTL_MS = 10 * 60 * 1000;
/** El bloqueo solo cubre contar y marcar (unas pocas consultas). Si la función muere con él, caduca solo. */
const LOCK_MS = 20_000;
/** Cuánto espera una petición a que otra del mismo buzón suelte el bloqueo antes de decir «espera unos segundos». */
const LOCK_WAIT_MS = 8_000;

export interface FreeUse {
  /** Cuentos con dibujos empezados sin pagar en el periodo (sin contar el actual). */
  used: number;
  /** Cuántos quedan contando el actual (0 = este es el último). */
  left: number;
  /** Desde cuándo se cuenta: hace 30 días o la última compra, lo más reciente. */
  since: string;
  /** Los libros que cuentan, para mandarlos por email (nunca a la pantalla). */
  books: { publicId: string; title: string | null }[];
}

/**
 * ¿Cuenta este libro como cuento gratis empezado? Si tiene personajes dibujados o en camino; si fallaron todos (Gemini
 * 503 o 429), no (auditoría 26 oct, B8). Y si acaba de pasar la puerta y aún no tiene hoja, o la que tiene falló antes
 * de que la pasara (un «Reintentar» que está volviendo a pintar), también: es el que se está empezando ahora.
 */
function counts(b: FreeBook, now: number): boolean {
  if (b.sheets.some((s) => s.status !== "failed")) return true;
  if (!b.freeClaimedAt) return false;
  const claimed = Date.parse(b.freeClaimedAt);
  if (!(now - claimed < CLAIM_TTL_MS)) return false;
  return !b.sheets.some((s) => Date.parse(s.updatedAt) > claimed);
}

/**
 * Libros del mismo buzón que ya tienen dibujos (o se están empezando) y no se han pagado, en el periodo. `exceptBookId`:
 * el que se está creando. Tres consultas, sin borradores.
 */
export async function freeUse(store: GenStore, email: string, opts: { exceptBookId?: string | null; now?: number; env?: Record<string, string | undefined> } = {}): Promise<FreeUse> {
  const now = opts.now ?? Date.now();
  const windowStart = now - FREE_WINDOW_DAYS * DAY;
  const recent = await store.listFreeBooks(normalizeEmail(email), new Date(windowStart).toISOString());

  // la última compra del mismo buzón abre otra tanda
  let since = windowStart;
  const unpaid: FreeBook[] = [];
  for (const b of recent) {
    // solo una compra de este entorno: en producción, «pagar» con la tarjeta de prueba en la preview no da otra tanda
    // (la base es la misma; revisión 26 oct)
    const paid = b.paid.filter((o) => paidInEnv(o.sessionId, opts.env ?? process.env));
    if (paid.length > 0) {
      since = Math.max(since, ...paid.map((o) => Date.parse(o.createdAt)));
      continue;
    }
    if (b.id === opts.exceptBookId || b.publicId === opts.exceptBookId) continue;
    if (counts(b, now)) unpaid.push(b);
  }
  const books = unpaid.filter((b) => Date.parse(b.createdAt) >= since).map((b) => ({ publicId: b.publicId, title: b.title }));
  return { used: books.length, left: Math.max(0, FREE_BOOKS - books.length - 1), since: new Date(since).toISOString(), books };
}

/** La clave del bloqueo: un hash del buzón, para no guardar el email en otra tabla. */
export function freeLockKey(email: string): string {
  return `free:${createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 32)}`;
}

/** `updatedAt`: el de la fila tras marcarla (para el guardado condicional que venga después). */
export type FreeGate = { ok: true; left: number; updatedAt?: string | null } | { ok: false; used: number; books: FreeUse["books"] } | { ok: false; busy: true };

/**
 * La puerta de los gratis con el bloqueo del buzón (I7): cuenta y, si cabe, marca el libro como empezado. Seis
 * peticiones a la vez con el mismo email entran de una en una, y la cuarta ya ve las tres anteriores.
 */
export async function passFreeGate(store: GenStore, email: string, bookId: string, opts: { now?: () => number; env?: Record<string, string | undefined>; waitMs?: number } = {}): Promise<FreeGate> {
  const clock = opts.now ?? Date.now;
  const key = freeLockKey(email);
  const giveUp = clock() + (opts.waitMs ?? LOCK_WAIT_MS);
  let holder = await store.lock(key, LOCK_MS);
  while (!holder && clock() < giveUp) {
    await new Promise((r) => setTimeout(r, 100 + Math.floor(Math.random() * 100)));
    holder = await store.lock(key, LOCK_MS);
  }
  if (!holder) return { ok: false, busy: true };
  try {
    const use = await freeUse(store, email, { exceptBookId: bookId, now: clock(), env: opts.env });
    if (use.used >= FREE_BOOKS) return { ok: false, used: use.used, books: use.books };
    const updatedAt = await store.claimFree(bookId, new Date(clock()).toISOString());
    return { ok: true, left: use.left, updatedAt };
  } finally {
    await store.unlock(key, holder).catch(() => null);
  }
}

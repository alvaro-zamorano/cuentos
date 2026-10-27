/**
 * El mismo buzón escrito de otra forma cuenta igual: mayúsculas, puntos de Gmail y alias `+algo` (límite de cuentos
 * gratis, lib/book/freeLimit.ts). La base hace lo mismo en cuentos_books.email_norm (función cuentos_email_norm,
 * migración 0013): si cambia aquí, cambia allí con otra migración (tests/unit/migraciones.test.ts compara las dos).
 * Coinciden con el email ya limpio (`cleanEmail`: sin espacios y en minúsculas, que es como se guarda). Con espacios
 * Unicode o mayúsculas raras («İ») podrían no coincidir.
 */
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

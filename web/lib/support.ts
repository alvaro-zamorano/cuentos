/**
 * Cómo se nombra un libro en los avisos a soporte (auditoría 26 oct, I30): sin el enlace ni el id público, que abren el
 * libro a quien lea el correo. Se usa el id interno (cuentos_books.id, un uuid que no abre nada): con sus ocho primeros
 * caracteres se encuentra en Supabase. No sale del id público: un trozo de ese sí ayudaría a adivinarlo (revisión 27 oct).
 */
export function bookRef(bookUuid: string): string {
  return `ref. ${bookUuid.slice(0, 8)}`;
}

/** La línea del libro en un aviso. */
export function bookLine(bookUuid: string): string {
  return `Libro: ${bookRef(bookUuid)} (en Supabase, cuentos_books con id que empieza así)`;
}

/**
 * Cómo se nombra un libro en los avisos a soporte (auditoría 26 oct, I30): sin el enlace ni el id entero, que abren el
 * libro a quien lea el correo. Los seis primeros caracteres del id bastan para encontrarlo en Supabase
 * (cuentos_books.public_id empieza así) y no lo abren.
 */
export function bookRef(publicId: string): string {
  return `ref. ${publicId.slice(0, 6)}`;
}

/** La línea del libro en un aviso. */
export function bookLine(publicId: string): string {
  return `Libro: ${bookRef(publicId)} (en Supabase, cuentos_books con public_id que empieza así)`;
}

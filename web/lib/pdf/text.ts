/**
 * Raya de diálogo pegada a lo que sigue («—Hoy…», «mundo —anunció»): sin el WORD JOINER el navegador puede partir la
 * línea justo después de la raya y dejarla colgando al final del renglón.
 */
export const joinDashes = (t: string) => t.replace(/—(?=\S)/g, "—\u2060");

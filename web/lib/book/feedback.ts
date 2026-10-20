/**
 * Motivo de «Otra versión» y aviso de «Sigue sin estar bien» (18 oct, propuesta aprobada por Álvaro).
 *
 * Antes, «Otra versión» repetía el prompt idéntico: si el fallo estaba en la escena (el perro de Olivia atravesando el
 * sofá), salía igual. Ahora el padre dice qué no le gusta; con eso se corrige el prompt de la versión nueva y queda
 * apuntado para saber qué falla. Este módulo no toca la red: solo valida y traduce el motivo. Vale en el cliente.
 */
export const REDO_REASONS = {
  parecido: "Un personaje no se parece",
  cuerpo: "Postura o cuerpo raro",
  reparto: "Sobra o falta alguien",
  escena: "No es lo que pasa en la escena",
  otro: "Otra cosa",
} as const;

export type RedoReason = keyof typeof REDO_REASONS;

export const REDO_NOTE_MAX = 240;
/** Versiones con motivo por página, además de la incluida. */
export const MAX_PAGE_REDOS = 2;
/** Versiones con motivo en todo el libro (cada una es una imagen: unos 6 céntimos con su control). */
export const MAX_BOOK_REDOS = 8;

export function isRedoReason(v: unknown): v is RedoReason {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(REDO_REASONS, v);
}

/** Línea fija en inglés por motivo: la corrección mínima aunque falle la llamada al modelo que reescribe la escena. */
export const REDO_FIX_EN: Record<RedoReason, string> = {
  parecido: "Match the character reference sheet exactly: same face, hair, skin tone, eyes and clothes for every recurring character.",
  cuerpo: "Use simple, natural poses with correct anatomy; every character complete and standing clearly in front of or beside the furniture.",
  reparto: "Show exactly the characters listed for this image: nobody else, and nobody missing.",
  escena: "Follow the scene description literally: the action, the place and the key objects.",
  otro: "",
};

/** Normaliza la nota libre: espacios, longitud. La moderación la hace el servidor. */
export function cleanNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim().slice(0, REDO_NOTE_MAX);
  return t || null;
}

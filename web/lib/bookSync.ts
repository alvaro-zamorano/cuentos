import type { Draft } from "./types";

export const BOOK_KEY = "cuentos:book:v1";

export function storedBookId(): string | null {
  try {
    return window.localStorage.getItem(BOOK_KEY);
  } catch {
    return null;
  }
}

export function storeBookId(id: string) {
  try {
    window.localStorage.setItem(BOOK_KEY, id);
  } catch {
    /* sin almacenamiento */
  }
}

/**
 * Guarda el borrador en cuentos_books.draft (POST /api/books). Sin Supabase la ruta responde 503
 * y el libro sigue solo en este navegador: nunca bloquea.
 * Devuelve { public_id, url } o null.
 */
export async function saveBook(draft: Draft, email?: string): Promise<{ public_id: string; url: string } | null> {
  try {
    const previous = storedBookId();
    const res = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: { ...draft, email: undefined }, email, public_id: previous ?? undefined }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok && json.public_id) {
      storeBookId(json.public_id);
      return { public_id: json.public_id, url: json.url };
    }
  } catch {
    /* sin red o sin backend */
  }
  return null;
}

/** Sincroniza solo si el libro ya existe en el servidor (tiene public_id). */
export async function syncBook(draft: Draft): Promise<void> {
  if (!storedBookId()) return;
  await saveBook(draft);
}

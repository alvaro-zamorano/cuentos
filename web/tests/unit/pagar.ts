/**
 * Para los tests que pagan: antes, como hace el paso 4 al seguir, se aprueban los últimos personajes dibujados (el pago
 * los pide aprobados, revisión 27 oct). Sin personajes dibujados no aprueba nada y el pago falla como siempre. La mejora a
 * tapa dura no los pide.
 */
import type { GenStore } from "../../lib/generation/store";
import { approveSheet, payDryRun } from "../../lib/book/service";

/** Aprueba los últimos personajes dibujados del libro, si los hay. */
export async function approveLast(store: GenStore, bookId: string): Promise<void> {
  const book = await store.findBook({ publicId: bookId });
  const sheets = book ? (await store.listJobs(book.id)).filter((j) => j.kind === "sheet" && j.status === "done") : [];
  const last = sheets[sheets.length - 1];
  if (last) await approveSheet(store, { bookId, sheetJobId: last.id });
}

/** El pago de prueba, con los personajes aprobados antes. */
export async function payApproved(store: GenStore, input: Parameters<typeof payDryRun>[1]): ReturnType<typeof payDryRun> {
  if (input.upgrade !== true && typeof input.bookId === "string") await approveLast(store, input.bookId);
  return payDryRun(store, input);
}

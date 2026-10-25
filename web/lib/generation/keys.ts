import { buildBook, currentStory, scenePromptFor } from "../story";
import { hashString } from "../story/hash";
import { normalizeTraits } from "../traits";
import type { Book, BookPage, Draft, StyleId } from "../types";

/**
 * Huellas de lo que pinta cada job de generación (B3). Compartidas por cliente y servidor: con las mismas entradas dan
 * la misma huella, y el servidor no crea un job cuya huella ya existe para ese libro (unique (book_id, job_key)).
 *
 * - Hoja: estilo + rasgos normalizados + edad (lo que entra en characterBible).
 * - Página: hoja + acompañante + historia (inputHash del cuento escrito, o «arco») + escena y su prompt.
 *   El texto de la página no entra: editarlo no cambia la imagen.
 * - Muestra (sampleKey): la huella de la página 9 (`mesa-tarta`). Si cambia, la muestra pintada ya no corresponde
 *   al cuento y se avisa antes de volver a gastar.
 */

export const SAMPLE_PAGE = 9;
export const MAX_SHEET_VERSIONS = 3; // la de la muestra + 2 «Otra versión de la hoja»
export const MAX_PAGE_VERSIONS = 2; // la incluida + 1 «Otra versión» por página

export type JobKind = "sheet" | "sample" | "page" | "cover" | "portrait";

function companionKey(draft: Draft) {
  const c = draft.companion;
  return c ? [c.kind, c.variant ?? null, c.traits ? normalizeTraits(c.traits) : null] : null;
}

export function sheetJobKey(draft: Draft, styleId: StyleId): string {
  return hashString(JSON.stringify(["sheet", styleId, normalizeTraits(draft.hero.traits), draft.hero.age]));
}

function storyKey(draft: Draft): string {
  return currentStory(draft)?.inputHash ?? "arco";
}

export function pageJobKey(draft: Draft, styleId: StyleId, page: Pick<BookPage, "n" | "scene" | "scenePrompt" | "withCompanion">): string {
  return hashString(
    JSON.stringify(["page", sheetJobKey(draft, styleId), companionKey(draft), storyKey(draft), page.n, page.scene, page.withCompanion, page.scenePrompt]),
  );
}

export function coverJobKey(draft: Draft, styleId: StyleId): string {
  return hashString(JSON.stringify(["cover", sheetJobKey(draft, styleId), companionKey(draft), draft.special, storyKey(draft)]));
}

export function samplePage(book: Book): BookPage {
  return book.pages.find((p) => p.n === SAMPLE_PAGE) ?? book.pages[SAMPLE_PAGE - 1];
}

/** Huella de la muestra: rasgos + estilo + historia de la página 9. */
export function sampleKey(draft: Draft, styleId: StyleId, book: Book = buildBook(draft)): string {
  return pageJobKey(draft, styleId, samplePage(book));
}

/** ¿La muestra guardada ya no corresponde al cuento actual? (solo si se llegó a pedir una). */
export function sampleIsStale(draft: Draft): boolean {
  const ill = draft.illustration;
  if (!ill?.sampleKey || !draft.styleId) return false;
  return ill.sampleKey !== sampleKey(draft, draft.styleId);
}

/** Clave única del job dentro del libro: tipo, página, versión y huella. */
export function jobKey(kind: JobKind, n: number, variant: number, key: string): string {
  return `${kind}:${n}:${variant}:${key}`;
}

/** Prompt de la portada (en inglés; el título nunca se pinta: lo compone el PDF). */
export function coverScenePrompt(draft: Draft): string {
  const withCompanion = !!draft.companion;
  const base = `Picture-book cover: the child stands in the centre, full body, proud and happy${withCompanion ? ", next to the companion" : ""}, with soft birthday details (bunting, a few balloons); keep the upper-left third calm and empty for the title`;
  return scenePromptFor(base, draft, withCompanion);
}

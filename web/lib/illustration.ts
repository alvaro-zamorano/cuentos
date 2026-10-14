import { normalizeTraits } from "./traits";
import type { Draft, Illustration } from "./types";

/**
 * Estado de la edición ilustrada: validez de la hoja y de las páginas frente a los rasgos actuales.
 * Las imágenes las pinta el servidor (/api/generate/*, lib/generation/service.ts); en dry-run no hay imagen y se
 * pinta la escena vectorial (components/IllustratedScene.tsx). `pages[n].variant` es la versión elegida (0 = la primera).
 */

export function emptyIllustration(): Illustration {
  return { paid: false, buyerDeclaration: false, sheetApproved: false, pages: {}, sheetVersions: 0, pageVersions: {} };
}

export function getIllustration(draft: Draft): Illustration {
  const ill = draft.illustration;
  return {
    ...emptyIllustration(),
    ...(ill ?? {}),
    pages: { ...(ill?.pages ?? {}) },
    sheetVersions: typeof ill?.sheetVersions === "number" ? ill.sheetVersions : 0,
    pageVersions: { ...(ill?.pageVersions ?? {}) },
  };
}

/** Huella de lo que dibuja la hoja: rasgos del protagonista + estilo. */
export function sheetKey(draft: Draft): string {
  return JSON.stringify([draft.styleId ?? null, normalizeTraits(draft.hero.traits)]);
}

/** Huella de lo que dibujan las páginas: hoja + acompañante. */
export function pagesKey(draft: Draft): string {
  const c = draft.companion;
  return JSON.stringify([sheetKey(draft), c ? [c.kind, c.variant ?? null, c.traits ? normalizeTraits(c.traits) : null] : null]);
}

export function sheetIsValid(draft: Draft): boolean {
  const ill = getIllustration(draft);
  return !!draft.styleId && ill.sheetApproved && ill.sheetKey === sheetKey(draft);
}

/** Páginas ilustradas válidas para el estado actual (si cambian rasgos, estilo o acompañante, se descartan). */
export function validPages(draft: Draft): Illustration["pages"] {
  const ill = getIllustration(draft);
  if (!sheetIsValid(draft) || ill.pagesKey !== pagesKey(draft)) return {};
  return ill.pages;
}

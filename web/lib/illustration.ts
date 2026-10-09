import { normalizeTraits } from "./traits";
import type { Draft, Illustration, StyleId } from "./types";

/**
 * Estado de la edición ilustrada: validez de la hoja y de las páginas frente a los rasgos actuales.
 * Las páginas se pintan en cliente con <Scene style=…> (components/IllustratedScene.tsx).
 */

export function emptyIllustration(): Illustration {
  return { paid: false, buyerDeclaration: false, sheetApproved: false, pages: {} };
}

export function getIllustration(draft: Draft): Illustration {
  return { ...emptyIllustration(), ...(draft.illustration ?? {}), pages: { ...(draft.illustration?.pages ?? {}) } };
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

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* ------------------------------ pintado (cliente) ------------------------------ */

/**
 * Pinta una página: la escena se compone en cliente; esta espera de 300–800 ms (determinista por
 * página y versión) marca el ritmo del progreso. No llama a ningún proveedor.
 */
export async function illustratePage(styleId: StyleId, n: number, variant = 0, signal?: AbortSignal): Promise<{ variant: number; ms: number }> {
  const ms = 300 + (hash(`delay:${styleId}:${n}:${variant}`) % 501);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("abort", "AbortError"));
    });
  });
  return { variant, ms };
}

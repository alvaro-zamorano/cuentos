"use client";

import { Scene } from "./Scene";
import { DEFAULT_PAINTED_STYLE, piecesFor } from "@/lib/pieces";
import { getStyle } from "@/lib/generation/styles";
import type { BookPage, Draft, StyleId } from "@/lib/types";

/** Texto de la etiqueta cuando el estilo elegido aún no tiene piezas pintadas. */
export function pendingStyleNotice(): string {
  return `Estilo disponible próximamente; vista en ${getStyle(DEFAULT_PAINTED_STYLE)?.label.toLowerCase() ?? DEFAULT_PAINTED_STYLE}`;
}

/** Estilo con el que se pinta de verdad: el elegido si tiene piezas; si no, el estilo pintado por defecto. */
export function paintedStyleFor(styleId: StyleId): StyleId {
  return piecesFor(styleId) ? styleId : DEFAULT_PAINTED_STYLE;
}

/**
 * Página de la edición ilustrada: la escena con acabado y figuras pintadas del estilo elegido.
 * Determinista por (estilo, página, versión).
 */
export function IllustratedScene({
  styleId,
  page,
  variant,
  draft,
  className,
  showNotice = true,
}: {
  styleId: StyleId;
  page: BookPage;
  variant: number;
  draft: Draft;
  className?: string;
  /** Etiqueta «próximamente» sobre la escena (se oculta en miniaturas y nunca se imprime). */
  showNotice?: boolean;
}) {
  const painted = paintedStyleFor(styleId);
  const pending = painted !== styleId;
  return (
    <div className={`relative ${className ?? ""}`} data-testid="illustrated-scene" data-variant={variant} data-painted-style={painted}>
      <Scene
        style={painted}
        variant={variant}
        scene={page.scene}
        traits={draft.hero.traits}
        expression={page.expression}
        companion={page.withCompanion ? draft.companion : undefined}
        special={draft.special}
        age={draft.hero.age}
        className="block w-full"
      />
      {pending && showNotice && (
        <span className="no-print absolute bottom-2 left-2 rounded-[4px] bg-white/90 px-2 py-1 text-[11px] leading-none text-ink-soft" data-testid="style-pending">
          {pendingStyleNotice()}
        </span>
      )}
    </div>
  );
}

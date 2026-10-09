"use client";

import { Avatar } from "./Avatar";
import { PaintedHead, PaintedStanding } from "./PaintedFigure";
import { paintedStyleFor, pendingStyleNotice } from "./IllustratedScene";
import { figureFor } from "@/lib/pieces";
import { getStyle } from "@/lib/generation/styles";
import { GARMENTS, HAIR_COLORS, HAIR_SHAPES, SKINS, normalizeTraits } from "@/lib/traits";
import type { StyleId, Traits } from "@/lib/types";

/**
 * Hoja de personaje: la figura pintada en tres vistas (de frente, en espejo y la cabeza en grande)
 * sobre papel, con la ficha de rasgos. Es la referencia de las doce páginas.
 */
export function CharacterSheet({ styleId, traits: raw, name }: { styleId: StyleId; traits: Traits; name: string }) {
  const t = normalizeTraits(raw);
  const painted = paintedStyleFor(styleId);
  const spec = figureFor(painted, t);
  const fallback = <Avatar traits={t} expression="feliz" size={200} />;
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const rows: { key: string; label: string; value: string }[] = [
    { key: "hair", label: "Pelo", value: `${label(HAIR_SHAPES, t.hair.shape)}, ${lower(label(HAIR_COLORS, t.hair.color))}` },
    { key: "skin", label: "Piel", value: label(SKINS, t.skin) },
    // las figuras pintadas recolorean piel y pelo; la ropa conserva los colores del estilo y los ojos y las gafas aún no se pintan
    { key: "outfit", label: "Ropa", value: label(GARMENTS, t.garment) },
  ];

  return (
    <div className="rounded-[8px] border border-line bg-paper" data-testid="character-sheet">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="font-display text-xl font-medium">{name || "Protagonista"}</h2>
        <span className="text-sm text-ink-soft">Estilo {getStyle(styleId)?.label ?? styleId}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-[1fr_1fr_1.3fr]">
        <figure className="flex flex-col items-center bg-paper px-2 pb-3 pt-4" data-testid="sheet-front">
          {spec ? <PaintedStanding spec={spec} className="h-56 w-full sm:h-64" fallback={fallback} /> : <Avatar traits={t} expression="feliz" size={180} />}
          <figcaption className="mt-2 text-xs text-ink-soft">De frente</figcaption>
        </figure>
        <figure className="flex flex-col items-center bg-paper px-2 pb-3 pt-4" data-testid="sheet-mirror">
          {spec ? <PaintedStanding spec={spec} flip className="h-56 w-full sm:h-64" fallback={fallback} /> : <Avatar traits={t} expression="feliz" size={180} flip />}
          <figcaption className="mt-2 text-xs text-ink-soft">En espejo</figcaption>
        </figure>
        <figure className="col-span-2 flex flex-col items-center justify-center bg-paper px-4 pb-3 pt-4 sm:col-span-1" data-testid="sheet-head">
          {spec ? <PaintedHead spec={spec} className="h-48 w-full sm:h-56" fallback={fallback} /> : <Avatar traits={t} expression="feliz" size={180} />}
          <figcaption className="mt-2 text-xs text-ink-soft">Cara</figcaption>
        </figure>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t border-line px-4 py-4 text-sm">
        {rows.map((r) => (
          <div key={r.key} className="contents" data-testid={`sheet-${r.key}`}>
            <dt className="text-ink-soft">{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      {painted !== styleId && (
        <p className="border-t border-line px-4 py-3 text-xs text-ink-soft" data-testid="style-pending">
          {pendingStyleNotice()}.
        </p>
      )}
    </div>
  );
}

function label<T extends { id: string; label: string }>(list: T[], id: string | undefined): string {
  return (list.find((x) => x.id === id) ?? list[0]).label;
}

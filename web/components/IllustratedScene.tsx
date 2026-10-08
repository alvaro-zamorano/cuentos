"use client";

import { CutoutImage } from "./CutoutImage";
import { StyleImage } from "./StyleImage";
import { companionCrop, heroCrop, pageLayout, type Placement } from "@/lib/illustration";
import type { Companion, StyleId, Traits } from "@/lib/types";

/**
 * Página ilustrada en modo demostración: ancla del estilo recortada a 3:2 con el avatar del catálogo
 * (y el acompañante) superpuestos. Determinista por (estilo, página, variante).
 */
export function IllustratedScene({
  styleId,
  n,
  variant,
  traits,
  companion,
  className,
}: {
  styleId: StyleId;
  n: number;
  variant: number;
  traits: Traits;
  companion?: Companion;
  className?: string;
}) {
  const l = pageLayout(styleId, n, variant);
  const hero = heroCrop(styleId, traits);
  const comp = companionCrop(styleId, companion);
  const place = (p: Placement): React.CSSProperties => ({
    left: `${p.centerX}%`,
    bottom: `${p.bottom}%`,
    height: `${p.height}%`,
    transform: `translateX(-50%)${p.flip ? " scaleX(-1)" : ""}`,
  });
  return (
    <div className={`relative aspect-[3/2] overflow-hidden bg-[#dfe9ef] ${className ?? ""}`} data-testid="illustrated-scene" data-variant={variant}>
      <div
        className="absolute"
        style={{
          width: `${l.zoom * 100}%`,
          height: `${l.zoom * 100}%`,
          left: `${-l.originX * l.zoom * 100}%`,
          top: `${-l.originY * l.zoom * 100}%`,
          transform: l.mirror ? "scaleX(-1)" : undefined,
        }}
      >
        <StyleImage styleId={styleId} showLabelOnFallback={false} className="h-full w-full object-fill" />
      </div>
      {comp && (
        <CutoutImage
          src={comp.src}
          alt="Acompañante"
          className="absolute w-auto max-w-none drop-shadow-[0_4px_4px_rgba(0,0,0,0.18)]"
          style={place(comp.slot === "elder" ? l.companion.elder : l.companion.ground)}
        />
      )}
      <CutoutImage src={hero.src} alt="Protagonista" className="absolute w-auto max-w-none drop-shadow-[0_4px_4px_rgba(0,0,0,0.2)]" style={place(l.hero)} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { getStyle } from "@/lib/generation/styles";
import type { StyleId } from "@/lib/types";

/**
 * Ancla del estilo (`public/styles/<id>.jpg`, ≤1200 px). Si el archivo no está en el despliegue
 * (los binarios se añaden aparte), pinta un degradado con la paleta y el nombre del estilo.
 */
export function StyleImage({
  styleId,
  className,
  imgStyle,
  showLabelOnFallback = true,
}: {
  styleId: StyleId;
  className?: string;
  imgStyle?: React.CSSProperties;
  showLabelOnFallback?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const style = getStyle(styleId);
  const palette = style?.palette ?? ["#cee3f4", "#c8d6bf"];
  if (failed === styleId) {
    return (
      <div
        data-testid="style-fallback"
        className={`flex items-center justify-center ${className ?? ""}`}
        style={{ background: `linear-gradient(160deg, ${palette[1] ?? palette[0]} 0%, ${palette[4] ?? palette[0]} 55%, ${palette[5] ?? palette[2] ?? palette[0]} 100%)` }}
      >
        {showLabelOnFallback && <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-black text-ink">{style?.label ?? styleId}</span>}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/styles/${styleId}.jpg`}
      alt={`Estilo ${style?.label ?? styleId}`}
      draggable={false}
      className={className}
      style={imgStyle}
      ref={(el) => {
        // si la imagen falló antes de hidratar, onError ya no llega
        if (el && el.complete && el.naturalWidth === 0) setFailed(styleId);
      }}
      onError={() => setFailed(styleId)}
    />
  );
}

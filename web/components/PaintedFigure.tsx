"use client";

import { useEffect, useState } from "react";
import type { CompanionSpec, FigureSpec } from "@/lib/pieces";
import { isFigure } from "@/lib/pieces";
import { recolorPiece } from "@/lib/recolor";

/** Pieza recoloreada en cliente; hasta que está lista no se pinta nada (evita el salto de color). */
function useRecolored(src: string, skin: string | null, hair: string | null): string | null {
  const key = `${src}|${skin ?? ""}|${hair ?? ""}`;
  const [state, setState] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const p = !skin && !hair ? Promise.resolve(src) : recolorPiece(src, { skin, hair });
    p.then((u) => alive && setState({ key, url: u })).catch(() => alive && setState({ key, url: src }));
    return () => {
      alive = false;
    };
  }, [src, skin, hair, key]);
  return state && state.key === key ? state.url : null;
}

/**
 * Figura pintada dentro de una escena SVG (viewBox 600×400).
 * Se coloca por el punto de apoyo: (x, y) = centro horizontal de los pies y línea del suelo; `height` en unidades de escena.
 */
export function PaintedFigure({
  spec,
  x,
  y,
  height,
  flip = false,
  tilt = 0,
  fallback = null,
}: {
  spec: FigureSpec;
  x: number;
  y: number;
  height: number;
  flip?: boolean;
  tilt?: number;
  /** Qué dibujar si las piezas no cargan (p. ej. el avatar vectorial). */
  fallback?: React.ReactNode;
}) {
  const bodyHref = useRecolored(spec.bodySrc, spec.skinHex, null);
  const headHref = useRecolored(spec.headSrc, spec.skinHex, spec.hairHex);
  const [broken, setBroken] = useState(false);
  if (broken) return <>{fallback}</>;
  const s = height / spec.body.h;
  const w = spec.body.w * s;
  const hx = spec.headX * s;
  const hy = spec.headY * s;
  const hw = spec.head.w * spec.headScale * s;
  const hh = spec.head.h * spec.headScale * s;
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) ${flip ? "scale(-1 1)" : ""} translate(${-w / 2} ${-height})`}>
      {bodyHref && <image href={bodyHref} width={w} height={height} preserveAspectRatio="none" data-piece="body" onError={() => setBroken(true)} />}
      {headHref && <image href={headHref} x={hx} y={hy} width={hw} height={hh} preserveAspectRatio="none" data-piece="head" onError={() => setBroken(true)} />}
    </g>
  );
}

/** Acompañante: mascota (cuerpo entero) o abuelo/a (busto). */
export function PaintedCompanion({
  spec,
  x,
  y,
  height,
  flip = false,
  fallback = null,
}: {
  spec: CompanionSpec | FigureSpec;
  x: number;
  y: number;
  height: number;
  flip?: boolean;
  fallback?: React.ReactNode;
}) {
  const [broken, setBroken] = useState(false);
  if (isFigure(spec)) return <PaintedFigure spec={spec} x={x} y={y} height={height} flip={flip} fallback={fallback} />;
  if (broken) return <>{fallback}</>;
  const s = height / spec.h;
  const w = spec.w * s;
  return (
    <g transform={`translate(${x} ${y}) ${flip ? "scale(-1 1)" : ""} translate(${-w / 2} ${-height})`}>
      <image href={spec.src} width={w} height={height} preserveAspectRatio="none" onError={() => setBroken(true)} />
    </g>
  );
}

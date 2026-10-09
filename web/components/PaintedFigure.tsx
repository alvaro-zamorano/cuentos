"use client";

import { useEffect, useId, useState } from "react";
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
  const mid = `pf${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
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
      {/* el corte recto inferior de la cabeza (pelo largo) se funde en vez de verse como una línea */}
      <defs>
        <linearGradient id={`${mid}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.955" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={`${mid}-m`} maskUnits="userSpaceOnUse" x={hx} y={hy} width={hw} height={hh}>
          <rect x={hx} y={hy} width={hw} height={hh} fill={`url(#${mid}-g)`} />
        </mask>
      </defs>
      {headHref && (
        <image
          href={headHref}
          x={hx}
          y={hy}
          width={hw}
          height={hh}
          preserveAspectRatio="none"
          data-piece="head"
          mask={`url(#${mid}-m)`}
          onError={() => setBroken(true)}
        />
      )}
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

/**
 * Cabeza sola (busto grande) para la hoja de personaje. Se dibuja en su propio SVG con el
 * tamaño natural de la pieza; el contenedor decide la escala.
 */
export function PaintedHead({ spec, className, fallback = null }: { spec: FigureSpec; className?: string; fallback?: React.ReactNode }) {
  const href = useRecolored(spec.headSrc, spec.skinHex, spec.hairHex);
  const [broken, setBroken] = useState(false);
  const mid = `hd${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (broken) return <>{fallback}</>;
  const { w, h } = spec.head;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} role="img" aria-label="Cabeza del protagonista">
      {/* el corte inferior de la pieza se funde con el papel */}
      <defs>
        <linearGradient id={`${mid}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.8" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <mask id={`${mid}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
          <rect width={w} height={h} fill={`url(#${mid}-g)`} />
        </mask>
      </defs>
      {href && (
        <image href={href} width={w} height={h} preserveAspectRatio="none" data-piece="head" mask={`url(#${mid}-m)`} onError={() => setBroken(true)} />
      )}
    </svg>
  );
}

/** Figura de pie en su propio SVG (portada, hoja de personaje). Encaja cabeza y cuerpo con un margen. */
export function PaintedStanding({
  spec,
  flip = false,
  className,
  fallback = null,
  shadow = true,
}: {
  spec: FigureSpec;
  flip?: boolean;
  className?: string;
  fallback?: React.ReactNode;
  shadow?: boolean;
}) {
  const { w, h } = spec.body;
  const hw = spec.head.w * spec.headScale;
  const half = Math.max(w / 2 - Math.min(0, spec.headX), Math.max(w, spec.headX + hw) - w / 2) + 8;
  const top = Math.min(0, spec.headY) - 8;
  const bottom = h + 14;
  return (
    <svg viewBox={`${w / 2 - half} ${top} ${half * 2} ${bottom - top}`} className={className} role="img" aria-label="Protagonista">
      {shadow && <ellipse cx={w / 2} cy={h - 2} rx={w * 0.34} ry={7} fill="#4a2a14" opacity="0.14" />}
      <PaintedFigure spec={spec} x={w / 2} y={h} height={h} flip={flip} fallback={fallback} />
    </svg>
  );
}

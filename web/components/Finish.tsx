"use client";

import { useId } from "react";

/**
 * Acabado ilustrado por código. Convierte formas planas en algo que lee como pintura:
 * bordes irregulares de pincel, textura de papel, luz direccional cálida, grano y viñeta.
 * Uso: <svg><FinishDefs id={fid}/><g filter={`url(#${fid}-rough)`}>…escena…</g><FinishOverlay id={fid}/></svg>
 */
export function useFinishId() {
  return `fin${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function FinishDefs({ id, seed = 7 }: { id: string; seed?: number }) {
  return (
    <defs>
      <filter id={`${id}-rough`} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed={seed} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id={`${id}-paper`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed + 1} result="g" />
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0.35 0" />
      </filter>
      <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed={seed + 2} result="g" />
        <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.12 0" />
      </filter>
      <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="160%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <radialGradient id={`${id}-light`} cx="0.3" cy="0.15" r="0.9">
        <stop offset="0" stopColor="#fff5d6" stopOpacity="0.55" />
        <stop offset="1" stopColor="#5a3a2a" stopOpacity="0.18" />
      </radialGradient>
      <radialGradient id={`${id}-vig`} cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.6" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#3a2416" stopOpacity="0.35" />
      </radialGradient>
    </defs>
  );
}

/** Capas finales sobre la escena (viewBox 600×400). */
export function FinishOverlay({ id, w = 600, h = 400 }: { id: string; w?: number; h?: number }) {
  return (
    <g pointerEvents="none">
      <rect width={w} height={h} fill={`url(#${id}-light)`} style={{ mixBlendMode: "multiply" }} />
      <rect width={w} height={h} filter={`url(#${id}-paper)`} style={{ mixBlendMode: "multiply" }} opacity="0.9" />
      <rect width={w} height={h} filter={`url(#${id}-grain)`} style={{ mixBlendMode: "overlay" }} />
      <rect width={w} height={h} fill={`url(#${id}-vig)`} />
    </g>
  );
}

/** Sombra de contacto suave bajo una figura. */
export function ContactShadow({ id, cx, cy, rx, ry = 12 }: { id: string; cx: number; cy: number; rx: number; ry?: number }) {
  return (
    <g filter={`url(#${id}-soft)`} opacity="0.28">
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#4a2a14" />
    </g>
  );
}

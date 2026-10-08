"use client";

import { useEffect, useState } from "react";
import { cutout } from "@/lib/cutout";

/**
 * Recorte del catálogo sin fondo blanco. Mientras se procesa (o si falla) se pinta con
 * mix-blend-mode: multiply, que también disimula el blanco.
 */
export function CutoutImage({ src, alt, className, style }: { src: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const [done, setDone] = useState<{ src: string; url: string | null } | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    cutout(src).then((url) => {
      if (alive) setDone({ src, url });
    });
    return () => {
      alive = false;
    };
  }, [src]);
  const url = done?.src === src ? done.url : null;
  if (missing) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url ?? src}
      alt={alt}
      draggable={false}
      onError={() => setMissing(true)}
      data-cutout={url ? "1" : "0"}
      className={className}
      style={{ ...style, mixBlendMode: url ? "normal" : "multiply" }}
    />
  );
}

"use client";

import type { ReactNode } from "react";
import type { GenJobView } from "@/lib/useGeneration";

export const TEST_PREVIEW_LABEL = "Vista previa sin ilustrar (modo de prueba)";

/**
 * Imagen generada de un job (URL firmada de Storage) o, si no hay imagen (dry-run), la escena vectorial pintada
 * (`fallback`). En dry-run se etiqueta con discreción; la etiqueta nunca se imprime.
 */
export function GeneratedPicture({
  job,
  provider,
  fallback,
  alt,
  className = "",
  aspect = "aspect-[3/2]",
  label = true,
  labelPlacement = "overlay",
}: {
  job: GenJobView | undefined;
  provider: string | null;
  fallback: ReactNode;
  alt: string;
  className?: string;
  aspect?: string;
  label?: boolean;
  /** "below": la etiqueta va debajo y `className` solo se aplica a la imagen real (la hoja de personaje trae su propio marco). */
  labelPlacement?: "overlay" | "below";
}) {
  if (job?.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Storage, caduca a los 10 min: sin optimizador
      <img src={job.url} alt={alt} className={`block w-full ${aspect} object-cover ${className}`} data-testid="generated-image" />
    );
  }
  const showLabel = label && provider === "dry-run" && !!job?.placeholder;
  if (labelPlacement === "below")
    return (
      <div className="grid gap-1.5" data-testid="generated-fallback">
        {fallback}
        {showLabel && (
          <span className="no-print text-[11px] leading-none text-ink-soft" data-testid="test-preview-label">
            {TEST_PREVIEW_LABEL}
          </span>
        )}
      </div>
    );
  return (
    <div className={`relative ${className}`} data-testid="generated-fallback">
      {fallback}
      {showLabel && (
        <span className="no-print absolute right-2 top-2 rounded-[4px] bg-white/90 px-2 py-1 text-[11px] leading-none text-ink-soft" data-testid="test-preview-label">
          {TEST_PREVIEW_LABEL}
        </span>
      )}
    </div>
  );
}

/** Hueco de una página aún sin pintar: papel velado y un candado tipográfico. */
export function LockedPicture({ caption = "Se pinta al confirmar" }: { caption?: string }) {
  return (
    <div className="locked-paper flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 text-ink-soft" aria-label={caption}>
      <svg aria-hidden viewBox="0 0 16 20" className="h-5 w-4" fill="none" stroke="currentColor" strokeWidth="1.2">
        <path d="M4 9V6a4 4 0 0 1 8 0v3" />
        <rect x="1.5" y="9" width="13" height="9.5" rx="1" />
        <path d="M8 13v2.2" />
      </svg>
      <span className="text-[13px] tracking-[0.01em]">{caption}</span>
    </div>
  );
}

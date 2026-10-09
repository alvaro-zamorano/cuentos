"use client";

import type { ReactNode } from "react";
import { Avatar } from "./Avatar";
import { PaintedStanding } from "./PaintedFigure";
import { Wordmark } from "./SiteHeader";
import { figureFor } from "@/lib/pieces";
import type { StyleId, Traits } from "@/lib/types";

/**
 * Hojas del libro (A4 apaisado = una doble página: ilustración y texto enfrentados).
 * Las medidas van en cqw para que la misma hoja sirva impresa (297 mm) y como muestra en pantalla.
 */

function storySize(text: string): string {
  // los textos cortos (2–4 años) van más grandes, como en un álbum
  if (text.length <= 90) return "text-[3.3cqw] leading-[1.42]";
  if (text.length <= 180) return "text-[2.75cqw] leading-[1.48]";
  return "text-[2.3cqw] leading-[1.5]";
}

export function BookSheet({ n, text, image, className = "" }: { n: number; text: string; image: ReactNode; className?: string }) {
  return (
    <section className={`sheet @container relative overflow-hidden ${className}`} data-page={n}>
      <div className="absolute inset-0 grid grid-cols-[61%_39%]">
        <div className="relative flex items-center pl-[5.4cqw] pr-[2.2cqw]">
          <div className="w-full border border-ink/15 bg-white p-[0.9cqw]">{image}</div>
        </div>
        {/* pliegue central, apenas visible */}
        <div className="flex items-center pl-[3.4cqw] pr-[6cqw]" style={{ background: "linear-gradient(90deg, rgba(60,40,20,0.06), rgba(60,40,20,0) 1.6cqw)" }}>
          <p className={`story max-w-[30ch] text-ink ${storySize(text)}`}>{text}</p>
        </div>
      </div>
      <span className="story absolute bottom-[3.4cqw] right-[6cqw] text-[1.35cqw] italic text-ink/45">{n}</span>
    </section>
  );
}

export function BookCover({
  title,
  dedication,
  traits,
  styleId,
  className = "",
  titleAs: Title = "h1",
}: {
  /** "p" cuando la portada es una muestra dentro de otra página (la landing ya tiene su h1). */
  titleAs?: "h1" | "p";
  title: string;
  dedication: string;
  traits: Traits;
  styleId: StyleId;
  className?: string;
}) {
  const spec = figureFor(styleId, traits);
  return (
    <section className={`sheet @container relative overflow-hidden ${className}`} data-page="cover">
      <div className="absolute inset-[2.7cqw] border border-ink/20" />
      <div className="absolute inset-y-0 left-[9cqw] flex w-[50cqw] flex-col justify-center">
        <Title className="display text-[7.4cqw] leading-[1.02] text-ink" style={{ fontVariationSettings: '"opsz" 144' }}>
          {title}
        </Title>
        <div className="mt-[3.4cqw] h-px w-[8cqw] bg-ink/40" />
        <p className="story mt-[3cqw] max-w-[34ch] text-[1.9cqw] italic leading-[1.45] text-ink/80">{dedication}</p>
      </div>
      <div className="absolute bottom-[6cqw] right-[9cqw] top-[8cqw] flex w-[30cqw] items-end justify-center">
        {spec ? (
          <PaintedStanding spec={spec} className="h-full w-full" fallback={<Avatar traits={traits} expression="orgullo" size={220} />} />
        ) : (
          <Avatar traits={traits} expression="orgullo" size={260} />
        )}
      </div>
      <div className="absolute bottom-[5cqw] left-[9cqw] text-[1.6cqw] text-ink/60">
        <Wordmark className="!text-[1.9cqw]" />
      </div>
    </section>
  );
}

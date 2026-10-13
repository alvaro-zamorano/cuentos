"use client";
/* eslint-disable @next/next/no-img-element -- imágenes estáticas ya optimizadas (WebP 1400 px) */

import { useState } from "react";
import { Icon } from "@/components/brand";
import { MUESTRA, muestraImage } from "@/lib/muestra";

/** Hojeador del libro de muestra: página abierta (ilustración + texto) y tira de miniaturas para saltar. */
export function SampleFlipper({ start = 7 }: { start?: number }) {
  const [n, setN] = useState(start);
  const total = MUESTRA.pages.length;
  const go = (d: number) => setN((x) => ((x - 1 + d + total) % total) + 1);
  const text = MUESTRA.pages[n - 1].replace(/\n/g, " ");

  return (
    <div className="grid gap-5">
      <div className="flex justify-end gap-2.5">
        <button type="button" aria-label="Página anterior" className="grid h-12 w-12 place-items-center rounded-full border-[1.5px] border-edge bg-card transition-transform hover:-translate-y-0.5" onClick={() => go(-1)}>
          <Icon.back />
        </button>
        <button type="button" aria-label="Página siguiente" className="grid h-12 w-12 place-items-center rounded-full bg-ink text-paper transition-transform hover:-translate-y-0.5" onClick={() => go(1)}>
          <Icon.next />
        </button>
      </div>
      <figure className="m-0 grid overflow-hidden rounded-[22px] bg-card shadow-[0_2px_0_#e6d8c1,0_40px_80px_-40px_rgba(35,32,54,0.45)] md:grid-cols-[1.15fr_1fr]">
        {/* marco 3:2 propio con la imagen absoluta dentro: un `height: 100%` en un hijo de rejilla lo resuelve Safari
            contra toda la tarjeta, la ilustración se alargaba y el texto quedaba encima */}
        <div className="relative aspect-[3/2] w-full overflow-hidden bg-night md:self-stretch">
          <img key={n} src={muestraImage(n)} alt={`Página ${n} del libro de muestra`} width={1400} height={939} className="rise absolute inset-0 block h-full w-full object-cover" />
        </div>
        <figcaption className="relative flex flex-col justify-between gap-6 px-6 py-7 sm:px-12 sm:py-12">
          <div aria-hidden className="absolute inset-y-0 left-0 hidden w-7 bg-gradient-to-r from-ink/10 to-transparent md:block" />
          <p key={n} className="story rise m-0 text-[18px] leading-[1.65] text-[#2b2538] sm:text-[21px]">
            <span className="display float-left mt-1 mr-1 text-[3.4em] leading-[0.8] text-accent">{text.charAt(0)}</span>
            {text.slice(1)}
          </p>
          <span className="self-center text-[13px] tracking-[0.14em] text-mute">{n}</span>
        </figcaption>
      </figure>
      <div className="flex gap-2.5 overflow-x-auto pt-1 pb-2" aria-label="Páginas del libro de muestra">
        {Array.from({ length: total }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            type="button"
            aria-label={`Ver la página ${p}`}
            aria-pressed={p === n}
            className={`shrink-0 overflow-hidden rounded-xl transition-[opacity,box-shadow] ${p === n ? "shadow-[0_0_0_3px_var(--paper-deep),0_0_0_6px_var(--accent)]" : "opacity-75 hover:opacity-100"}`}
            onClick={() => setN(p)}
          >
            <img src={`/muestra/mini/luna-${String(p).padStart(2, "0")}.webp`} alt="" width={128} height={86} className="block h-[64px] w-[96px] object-cover sm:h-[86px] sm:w-[128px]" />
          </button>
        ))}
      </div>
      <p className="hand m-0 text-[19px] text-ink-soft">Vera es la misma niña en las trece ilustraciones →</p>
    </div>
  );
}

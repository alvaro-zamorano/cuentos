"use client";
/* eslint-disable @next/next/no-img-element -- miniaturas estáticas de 240 px (WebP) que además se recolorean en canvas */

import { useEffect, useState } from "react";
import { Icon } from "@/components/brand";
import { recolorPiece } from "@/lib/recolor";
import type { Pick } from "@/lib/crearPicks";

/** Miniatura con el pelo y la piel elegidos; mientras se recolorea, la original. */
function useTinted(src: string, skin?: string | null, hair?: string | null, hairMask?: string): string {
  const key = `${src}|${skin ?? ""}|${hair ?? ""}`;
  const [state, setState] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!skin && !hair) return;
    let alive = true;
    recolorPiece(src, { skin, hair, hairMask })
      .then((url) => alive && setState({ key, url }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [src, skin, hair, hairMask, key]);
  return (skin || hair) && state?.key === key ? state.url : src;
}

/**
 * Guiones opcionales para las etiquetas que no caben enteras a 360 px: sin ellos, «Transparentes» se partía sin guion
 * (revisión independiente). Se enseñan así y el nombre del botón sigue siendo la etiqueta tal cual.
 */
const SOFT_HYPHENS: Record<string, string> = { Transparentes: "Trans\u00ADparentes" };

function Tile({ pick, on, tall, tint, onClick }: { pick: Pick; on: boolean; tall?: boolean; tint?: { skin?: string | null; hair?: string | null }; onClick: () => void }) {
  const src = useTinted(pick.src, tint?.skin, tint?.hair, pick.mask);
  return (
    <button type="button" aria-pressed={on} className={`tile ${on ? "tile-on" : ""}`} onClick={onClick} data-pick={pick.id}>
      <img src={src} alt="" loading="lazy" draggable={false} className={`w-full object-cover object-top ${tall ? "aspect-[3/4]" : "aspect-square"}`} />
      {SOFT_HYPHENS[pick.label] ? (
        <>
          <span className="tile-label" aria-hidden>
            {SOFT_HYPHENS[pick.label]}
          </span>
          <span className="sr-only">{pick.label}</span>
        </>
      ) : (
        <span className="tile-label">{pick.label}</span>
      )}
      {on && (
        <span aria-hidden className="rise absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-white shadow-[0_0_0_2px_#fff]">
          <Icon.check size={13} />
        </span>
      )}
    </button>
  );
}

/**
 * Rejilla de opciones con imagen (pelo, gafas, ropa, mascotas): el padre ve lo que elige. Pulsar otra vez la elegida
 * la quita. `tint` recolorea las caras con el pelo y la piel ya elegidos.
 */
export function Tiles({ picks, value, onPick, label, cols = "grid-cols-4 sm:grid-cols-6", tall, tint }: { picks: Pick[]; value: string | undefined; onPick: (id: string) => void; label: string; cols?: string; tall?: boolean; tint?: { skin?: string | null; hair?: string | null } }) {
  return (
    <div role="group" aria-label={label} className={`grid gap-2 ${cols}`}>
      {picks.map((p) => (
        <Tile key={p.id} pick={p} on={value === p.id} tall={tall} tint={tint} onClick={() => onPick(p.id)} />
      ))}
    </div>
  );
}

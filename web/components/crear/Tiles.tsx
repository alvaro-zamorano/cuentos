"use client";
/* eslint-disable @next/next/no-img-element -- miniaturas estáticas de 240 px (WebP) que además se recolorean en canvas */

import { useEffect, useState } from "react";
import { recolorPiece } from "@/lib/recolor";
import type { Pick } from "@/lib/crearPicks";

/** Miniatura con el pelo y la piel elegidos; mientras se recolorea, la original. */
function useTinted(src: string, skin?: string | null, hair?: string | null): string {
  const key = `${src}|${skin ?? ""}|${hair ?? ""}`;
  const [state, setState] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    if (!skin && !hair) return;
    let alive = true;
    recolorPiece(src, { skin, hair })
      .then((url) => alive && setState({ key, url }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [src, skin, hair, key]);
  return (skin || hair) && state?.key === key ? state.url : src;
}

function Tile({ pick, on, tall, tint, onClick }: { pick: Pick; on: boolean; tall?: boolean; tint?: { skin?: string | null; hair?: string | null }; onClick: () => void }) {
  const src = useTinted(pick.src, tint?.skin, tint?.hair);
  return (
    <button type="button" aria-pressed={on} className={`tile ${on ? "tile-on" : ""}`} onClick={onClick} data-pick={pick.id}>
      <img src={src} alt="" loading="lazy" draggable={false} className={`w-full bg-white object-cover object-top ${tall ? "aspect-[3/4]" : "aspect-square"}`} />
      <span className="tile-label">{pick.label}</span>
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

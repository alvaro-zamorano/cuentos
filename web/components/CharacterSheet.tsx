"use client";

import { CutoutImage } from "./CutoutImage";
import { catalogCrop, type CatalogCategory } from "@/lib/catalog";
import { getStyle } from "@/lib/generation/styles";
import { EYE_SHAPES, GARMENTS, GLASSES, HAIR_SHAPES, SKINS, normalizeTraits } from "@/lib/traits";
import type { StyleId, Traits } from "@/lib/types";

/**
 * Hoja de personaje en dry-run: cuadrícula tipo turnaround compuesta con los recortes del catálogo
 * del estilo elegido. Si el estilo no tiene una categoría (huecos del manifest), usa el del estilo
 * más parecido y lo marca como «provisional».
 */
export function CharacterSheet({ styleId, traits: raw, name }: { styleId: StyleId; traits: Traits; name: string }) {
  const t = normalizeTraits(raw);
  const garment = t.garment ?? "jersey";
  const cells: { key: string; label: string; category: CatalogCategory; id: string; big?: boolean; flip?: boolean }[] = [
    { key: "front", label: "De frente", category: "outfit", id: garment, big: true },
    { key: "side", label: "Girado", category: "outfit", id: garment, big: true, flip: true },
    { key: "hair", label: `Pelo · ${label(HAIR_SHAPES, t.hair.shape)}`, category: "hair", id: t.hair.shape },
    { key: "skin", label: `Piel · ${label(SKINS, t.skin)}`, category: "skin", id: t.skin },
    { key: "eyes", label: `Ojos · ${label(EYE_SHAPES, t.eyeShape)}`, category: "eyes", id: t.eyeShape ?? "puntos" },
  ];
  if (t.glasses !== "no") cells.push({ key: "glasses", label: `Gafas · ${label(GLASSES, t.glasses)}`, category: "glasses", id: t.glasses });
  cells.push({ key: "outfit", label: `Ropa · ${label(GARMENTS, garment)}`, category: "outfit", id: garment });

  return (
    <div className="rounded-3xl border-2 border-line bg-white p-4" data-testid="character-sheet">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-black">{name || "Protagonista"}</h3>
        <span className="text-xs font-bold text-ink-soft">Estilo {getStyle(styleId)?.label ?? styleId}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cells.map((c) => {
          const crop = catalogCrop(styleId, c.category, c.id);
          return (
            <figure
              key={c.key}
              className={`relative flex flex-col items-center rounded-2xl bg-cream p-2 ${c.big ? "row-span-2" : ""}`}
              data-testid={`sheet-${c.key}`}
              data-provisional={crop.provisional ? "1" : "0"}
            >
              <div className={`flex w-full items-end justify-center ${c.big ? "h-64 sm:h-72" : "h-28"}`}>
                <CutoutImage src={crop.src} alt={c.label} className="max-h-full max-w-full object-contain" style={c.flip ? { transform: "scaleX(-1)" } : undefined} />
              </div>
              <figcaption className="mt-1 text-center text-xs font-bold text-ink-soft">{c.label}</figcaption>
              {crop.provisional && (
                <span
                  className="absolute left-2 top-2 rounded-full bg-sun px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-ink"
                  title={`Este estilo aún no tiene esta parte del catálogo: se muestra la del estilo ${getStyle(crop.fromStyle)?.label ?? crop.fromStyle}.`}
                >
                  provisional
                </span>
              )}
            </figure>
          );
        })}
      </div>
    </div>
  );
}

function label<T extends { id: string; label: string }>(list: T[], id: string | undefined): string {
  return (list.find((x) => x.id === id) ?? list[0]).label.toLowerCase();
}

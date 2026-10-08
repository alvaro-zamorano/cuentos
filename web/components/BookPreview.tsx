"use client";

import type { ReactNode } from "react";
import type { Book, BookPage, Draft } from "@/lib/types";

/**
 * Preview de las 12 páginas con texto editable. Lo usan el Clásico (imagen = escena SVG)
 * y la edición ilustrada (imagen = página ilustrada + botón de regenerar).
 */
export function BookPreview({
  book,
  draft,
  update,
  renderImage,
  renderActions,
}: {
  book: Book;
  draft: Draft;
  update: (patch: Partial<Draft>) => void;
  renderImage: (p: BookPage) => ReactNode;
  renderActions?: (p: BookPage) => ReactNode;
}) {
  return (
    <>
      {book.pages.map((p) => (
        <article key={p.n} className="card grid gap-3 overflow-hidden p-0 md:grid-cols-[3fr_2fr]" data-testid={`page-${p.n}`}>
          <div className="relative">{renderImage(p)}</div>
          <div className="flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-ink-soft">Página {p.n}</span>
              {renderActions?.(p)}
            </div>
            <textarea
              value={p.text}
              rows={5}
              aria-label={`Texto de la página ${p.n}`}
              maxLength={draft.hero.age <= 4 ? 120 : 360}
              onChange={(e) => update({ textOverrides: { ...draft.textOverrides, [p.n]: e.target.value } })}
              className="min-h-28 w-full resize-none rounded-2xl border-2 border-transparent bg-cream p-3 font-story text-[17px] leading-snug outline-none focus:border-ink"
            />
            {draft.textOverrides[p.n] !== undefined && (
              <button
                type="button"
                className="self-start text-xs font-bold text-ink-soft underline"
                onClick={() => {
                  const next = { ...draft.textOverrides };
                  delete next[p.n];
                  update({ textOverrides: next });
                }}
              >
                Volver al texto original
              </button>
            )}
          </div>
        </article>
      ))}
    </>
  );
}

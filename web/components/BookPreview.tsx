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
        <article key={p.n} className="grid overflow-hidden rounded-[8px] border border-line bg-card md:grid-cols-[3fr_2fr]" data-testid={`page-${p.n}`}>
          <div className="relative border-b border-line md:border-b-0 md:border-r">{renderImage(p)}</div>
          <div className="flex flex-col gap-2 p-4 md:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-ink-soft">Página {p.n}</span>
              {renderActions?.(p)}
            </div>
            <textarea
              value={p.text}
              rows={5}
              aria-label={`Texto de la página ${p.n}`}
              maxLength={draft.hero.age <= 4 ? 120 : 360}
              onChange={(e) => update({ textOverrides: { ...draft.textOverrides, [p.n]: e.target.value } })}
              className="story min-h-32 w-full flex-1 resize-none rounded-[4px] border border-transparent bg-paper/60 p-3 text-[18px] leading-[1.5] text-ink outline-none transition-colors hover:border-line focus:border-ink/40 focus:bg-white"
            />
            {draft.textOverrides[p.n] !== undefined && (
              <button
                type="button"
                className="self-start text-xs text-ink-soft underline underline-offset-2 hover:text-ink"
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

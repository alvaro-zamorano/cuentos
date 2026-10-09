"use client";

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BookCover, BookSheet } from "@/components/BookSheet";
import { IllustratedScene, paintedStyleFor } from "@/components/IllustratedScene";
import { Scene } from "@/components/Scene";
import { DEFAULT_PAINTED_STYLE } from "@/lib/pieces";
import { DEMO_DRAFT } from "@/lib/demo";
import { useDraft } from "@/lib/draftStore";
import { validPages } from "@/lib/illustration";
import { buildBook } from "@/lib/story";
import type { Draft } from "@/lib/types";

export default function LibroPage() {
  return (
    <Suspense fallback={null}>
      <Libro />
    </Suspense>
  );
}

const SHEET_PX = (297 / 25.4) * 96; // ancho de una hoja A4 apaisada en px CSS

/** En pantallas estrechas, reduce las hojas para que quepan (en impresión, zoom 1). */
function useFitZoom(ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const fit = () => setZoom(Math.min(1, (el.clientWidth - 32) / SHEET_PX));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);
  return { ref, zoom };
}

function Libro() {
  const params = useSearchParams();
  const stored = useDraft();
  const demo = params.get("demo") === "1";
  const draft: Draft | null = demo ? DEMO_DRAFT : stored;
  const wantsIllustrated = !demo && params.get("edition") === "illustrated";
  const pages = draft && wantsIllustrated ? validPages(draft) : {};
  const illustrated = wantsIllustrated && !!draft?.styleId && Object.keys(pages).length >= 12;
  const hasStory = !!draft && draft.hero.name.trim().length > 0;
  const book = useMemo(() => (draft && hasStory ? buildBook(draft) : null), [draft, hasStory]);
  const blocked = wantsIllustrated && !illustrated;
  const { ref, zoom } = useFitZoom(!!book && !blocked);

  useEffect(() => {
    if (book && !blocked && params.get("print") === "1") {
      // margen para que carguen y se recoloreen las figuras pintadas
      const t = setTimeout(() => window.print(), 1500);
      return () => clearTimeout(t);
    }
  }, [book, blocked, params]);

  if (!draft) return null;
  if (!book || blocked)
    return (
      <main className="mx-auto grid max-w-md gap-4 px-4 py-16 text-center">
        <p className="display text-2xl">{blocked && book ? "La edición ilustrada de este cuento aún no está terminada." : "Aún no hay ningún cuento aquí."}</p>
        <Link href={blocked && book ? "/ilustrado" : "/crear"} className="btn-primary justify-self-center">
          {blocked && book ? "Ir a la edición ilustrada" : "Crear un cuento"}
        </Link>
      </main>
    );

  const coverStyle = illustrated && draft.styleId ? paintedStyleFor(draft.styleId) : DEFAULT_PAINTED_STYLE;

  return (
    <main className="bg-paper-deep print:bg-white">
      <div className="no-print sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 text-sm text-ink-soft">
            <p className="font-display text-base font-medium text-ink">{book.title}</p>
            <p>13 hojas A4 apaisadas. En el diálogo de impresión, elige «Guardar como PDF» o imprime a doble cara por el lado corto.</p>
          </div>
          <div className="flex gap-2">
            <Link href={demo ? "/crear" : illustrated ? "/ilustrado" : "/crear?paso=3"} className="btn-ghost btn-sm">
              {demo ? "Crear uno propio" : "Volver a editar"}
            </Link>
            <button type="button" className="btn-primary btn-sm" onClick={() => window.print()}>
              Imprimir o guardar PDF
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <div
          ref={ref}
          className="sheets flex flex-col gap-6 py-6 print:gap-0 print:py-0"
          style={{ zoom }}
          data-edition={illustrated ? "illustrated" : "classic"}
        >
          <BookCover title={book.title} dedication={book.dedication} traits={draft.hero.traits} styleId={coverStyle} className="shadow-[0_1px_3px_rgba(31,26,23,0.12)] print:shadow-none" />
          {book.pages.map((p) => (
            <BookSheet
              key={p.n}
              n={p.n}
              text={p.text}
              className="shadow-[0_1px_3px_rgba(31,26,23,0.12)] print:shadow-none"
              image={
                illustrated && draft.styleId ? (
                  <IllustratedScene styleId={draft.styleId} page={p} variant={pages[p.n]?.variant ?? 0} draft={draft} />
                ) : (
                  <Scene
                    style={DEFAULT_PAINTED_STYLE}
                    scene={p.scene}
                    traits={draft.hero.traits}
                    expression={p.expression}
                    companion={p.withCompanion ? draft.companion : undefined}
                    special={draft.special}
                    age={draft.hero.age}
                    className="block w-full"
                  />
                )
              }
            />
          ))}
        </div>
      </div>
    </main>
  );
}

"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { IllustratedScene } from "@/components/IllustratedScene";
import { Scene } from "@/components/Scene";
import { DEFAULT_PAINTED_STYLE } from "@/lib/pieces";
import { StyleImage } from "@/components/StyleImage";
import { DEMO_DRAFT } from "@/lib/demo";
import { useDraft } from "@/lib/draftStore";
import { DRY_RUN_NOTICE, validPages } from "@/lib/illustration";
import { buildBook } from "@/lib/story";
import type { Draft } from "@/lib/types";

export default function LibroPage() {
  return (
    <Suspense fallback={null}>
      <Libro />
    </Suspense>
  );
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

  useEffect(() => {
    if (book && !blocked && params.get("print") === "1") {
      // margen para que carguen las imágenes del libro ilustrado
      const t = setTimeout(() => window.print(), illustrated ? 1500 : 600);
      return () => clearTimeout(t);
    }
  }, [book, blocked, illustrated, params]);

  if (!draft) return null;
  if (!book || blocked)
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <p className="text-lg font-bold">{blocked && book ? "Este cuento aún no tiene la edición ilustrada terminada." : "Aún no hay ningún cuento aquí."}</p>
        <Link href={blocked && book ? "/ilustrado" : "/crear"} className="btn-primary mt-4">
          {blocked && book ? "Ir a la edición ilustrada" : "Crear uno"}
        </Link>
      </main>
    );

  return (
    <main className="bg-[#e8e0d2]">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b-2 border-line bg-cream px-5 py-3">
        <div className="text-sm">
          <strong>{book.title}</strong> · 13 hojas A4 apaisadas. En el diálogo de impresión elige «Guardar como PDF» o imprime a doble cara por el lado corto.
          {illustrated && <span className="block font-bold text-coral">{DRY_RUN_NOTICE}.</span>}
        </div>
        <div className="flex gap-2">
          <Link href={demo ? "/crear" : illustrated ? "/ilustrado" : "/crear"} className="btn-ghost px-4 py-2 text-sm">
            {demo ? "Crear el de mi peque" : "Volver a editar"}
          </Link>
          <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={() => window.print()}>
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-[297mm] flex-col gap-6 py-6 print:gap-0 print:py-0" data-edition={illustrated ? "illustrated" : "classic"}>
        {/* Portada */}
        <section className="sheet relative overflow-hidden shadow-xl print:shadow-none" style={{ background: "#f6c445" }}>
          {illustrated && draft.styleId && (
            <div className="absolute inset-0 opacity-35">
              <StyleImage styleId={draft.styleId} showLabelOnFallback={false} className="h-full w-full object-cover" />
            </div>
          )}
          <div className="absolute inset-[8mm] rounded-[12mm] border-[2mm] border-white/70" />
          <div className="absolute left-[18mm] top-[22mm] max-w-[150mm]">
            <p className="text-[5mm] font-black uppercase tracking-widest text-ink/60">Un cuento que no existía hasta hoy</p>
            <h1 className="mt-[4mm] text-[18mm] font-black leading-[1] text-ink">{book.title}</h1>
            <p className="mt-[8mm] font-story text-[6mm] italic text-ink/80">{book.dedication}</p>
          </div>
          <div className="absolute bottom-[14mm] right-[22mm]">
            <Avatar traits={draft.hero.traits} expression="orgullo" size={250} />
          </div>
        </section>

        {book.pages.map((p) => (
          <section
            key={p.n}
            className="sheet relative grid grid-cols-[66%_34%] items-center overflow-hidden shadow-xl print:shadow-none"
            style={{ background: p.n % 2 ? "#fff8ec" : "#f3f7ee" }}
          >
            <div className="pl-[12mm] pr-[4mm]">
              <div className="overflow-hidden rounded-[8mm] border-[1.5mm] border-white shadow-[0_2mm_0_rgba(0,0,0,0.06)]">
                {illustrated && draft.styleId ? (
                  <IllustratedScene
                    styleId={draft.styleId}
                    n={p.n}
                    variant={pages[p.n]?.variant ?? 0}
                    traits={draft.hero.traits}
                    companion={p.withCompanion ? draft.companion : undefined}
                    className="block w-full"
                  />
                ) : (
                  <Scene style={DEFAULT_PAINTED_STYLE}
                    scene={p.scene}
                    traits={draft.hero.traits}
                    expression={p.expression}
                    companion={p.withCompanion ? draft.companion : undefined}
                    special={draft.special}
                    age={draft.hero.age}
                    className="block w-full"
                  />
                )}
              </div>
            </div>
            <div className="flex flex-col justify-center px-[10mm] py-[16mm]">
              <p className="font-story text-[7mm] leading-[1.4] text-ink">{p.text}</p>
            </div>
            <span className="absolute bottom-[8mm] right-[10mm] text-[4mm] font-bold text-ink/40">{p.n}</span>
          </section>
        ))}
      </div>
    </main>
  );
}

"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Scene } from "@/components/Scene";
import { buildBook, loadDraft } from "@/lib/story";
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const d = loadDraft();
    if (d && d.hero.name.trim()) setDraft(d);
    else setMissing(true);
  }, []);

  const book = useMemo(() => (draft ? buildBook(draft) : null), [draft]);

  useEffect(() => {
    if (book && params.get("print") === "1") {
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [book, params]);

  if (missing)
    return (
      <main className="mx-auto max-w-md p-8 text-center">
        <p className="text-lg font-bold">Aún no hay ningún cuento aquí.</p>
        <Link href="/crear" className="btn-primary mt-4">
          Crear uno
        </Link>
      </main>
    );
  if (!draft || !book) return null;

  return (
    <main className="bg-[#e8e0d2]">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b-2 border-line bg-cream px-5 py-3">
        <div className="text-sm">
          <strong>{book.title}</strong> · 13 hojas A4 apaisadas. En el diálogo de impresión elige «Guardar como PDF» o imprime a doble cara por el lado corto.
        </div>
        <div className="flex gap-2">
          <Link href="/crear" className="btn-ghost px-4 py-2 text-sm">
            Volver a editar
          </Link>
          <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={() => window.print()}>
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      <div className="mx-auto flex max-w-[297mm] flex-col gap-6 py-6 print:gap-0 print:py-0">
        {/* Portada */}
        <section className="sheet relative overflow-hidden shadow-xl print:shadow-none" style={{ background: "#f6c445" }}>
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
                <Scene
                  scene={p.scene}
                  traits={draft.hero.traits}
                  expression={p.expression}
                  companion={p.withCompanion ? draft.companion : undefined}
                  special={draft.special}
                  age={draft.hero.age}
                  className="block w-full"
                />
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

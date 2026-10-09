import type { Metadata } from "next";
import Link from "next/link";
import { Scene } from "@/components/Scene";
import { DEFAULT_PAINTED_STYLE } from "@/lib/pieces";
import { GratisForm } from "./GratisForm";
import { DEMO_DRAFT } from "@/lib/demo";
import { buildBook } from "@/lib/story";

export const metadata: Metadata = {
  title: "Cuento de cumpleaños gratis para imprimir",
  description: "Descarga gratis un cuento de cumpleaños de 12 páginas para imprimir en casa en A4. Luego crea el de tu peque, con su nombre y su mundo.",
};

const book = buildBook(DEMO_DRAFT);
const PREVIEW = [1, 5, 9];

export default function Gratis() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Link href="/" className="text-lg font-black tracking-tight">
          cuentos<span className="text-coral">.</span>
        </Link>
        <Link href="/crear" className="btn-ghost px-5 py-2 text-sm">
          Crear el de mi peque
        </Link>
      </header>

      <section className="mx-auto grid max-w-5xl gap-8 px-5 pb-10 pt-4 md:grid-cols-[1.1fr_1fr] md:items-start">
        <div>
          <p className="mb-3 inline-block rounded-full bg-sun/40 px-3 py-1 text-xs font-black uppercase tracking-wide text-ink-soft">Gratis · PDF para imprimir</p>
          <h1 className="text-4xl font-black leading-[1.05] md:text-5xl">{book.title}</h1>
          <p className="mt-4 text-lg text-ink-soft">
            Un cuento de cumpleaños de 12 páginas, con Lucas, su perro Toby y muchos dinosaurios. Se imprime en casa en A4 apaisado, en cinco minutos.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {PREVIEW.map((n) => {
              const p = book.pages[n - 1];
              return (
                <figure key={n} className="card overflow-hidden p-0">
                  <Scene style={DEFAULT_PAINTED_STYLE}
                    scene={p.scene}
                    traits={DEMO_DRAFT.hero.traits}
                    expression={p.expression}
                    companion={p.withCompanion ? DEMO_DRAFT.companion : undefined}
                    special={DEMO_DRAFT.special}
                    age={DEMO_DRAFT.hero.age}
                    className="w-full"
                  />
                  <figcaption className="px-3 py-2 text-xs font-bold text-ink-soft">Página {n}</figcaption>
                </figure>
              );
            })}
          </div>
          <p className="mt-4 font-story text-[17px] leading-snug">{book.pages[0].text}</p>
        </div>

        <div className="card" id="descargar">
          <h2 className="text-xl font-black">Descargar en PDF</h2>
          <p className="mb-4 mt-1 text-sm text-ink-soft">
            Te pedimos un email y se abre el cuento listo para imprimir. En el diálogo de impresión elige «Guardar como PDF».
          </p>
          <GratisForm />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-12">
        <div className="card grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="text-2xl font-black">¿Y si el protagonista fuera tu peque?</h2>
            <p className="mt-2 text-ink-soft">Su nombre, su edad, cómo es y quién le acompaña. Tres pantallas y a imprimir.</p>
          </div>
          <Link href="/crear" className="btn-primary">
            Crear su cuento
          </Link>
        </div>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Scene } from "@/components/Scene";
import { SiteHeader } from "@/components/SiteHeader";
import { DEFAULT_PAINTED_STYLE } from "@/lib/pieces";
import { GratisForm } from "./GratisForm";
import { DEMO_DRAFT } from "@/lib/demo";
import { buildBook } from "@/lib/story";

export const metadata: Metadata = {
  title: "Cuento de cumpleaños de muestra, gratis para imprimir",
  description:
    "Descarga gratis un cuento de cumpleaños ilustrado de 12 páginas para imprimir en A4. Después, crea el cuento personalizado de tu hijo o tu hija.",
};

const book = buildBook(DEMO_DRAFT);
const PREVIEW = [1, 5, 9];

export default function Gratis() {
  return (
    <main className="flex-1">
      <SiteHeader wide>
        <Link href="/crear" className="btn-ghost btn-sm">
          Crear uno propio
        </Link>
      </SiteHeader>

      <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-8 sm:px-6 md:grid-cols-[1.15fr_1fr] md:items-start md:pt-14">
        <div>
          <h1 className="display text-[40px] md:text-[56px]">{book.title}</h1>
          <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-ink-soft">
            Un cuento de muestra de doce páginas: Lucas cumple 5 años, su perro Toby le acompaña y los dinosaurios aparecen en su deseo. Se imprime en
            A4 apaisado.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-2 sm:gap-3">
            {PREVIEW.map((n) => {
              const p = book.pages[n - 1];
              return (
                <figure key={n}>
                  <div className="overflow-hidden rounded-[4px] border border-line bg-card">
                    <Scene
                      style={DEFAULT_PAINTED_STYLE}
                      scene={p.scene}
                      traits={DEMO_DRAFT.hero.traits}
                      expression={p.expression}
                      companion={p.withCompanion ? DEMO_DRAFT.companion : undefined}
                      special={DEMO_DRAFT.special}
                      age={DEMO_DRAFT.hero.age}
                      className="block w-full"
                    />
                  </div>
                  <figcaption className="mt-1.5 text-xs text-ink-soft">Página {n}</figcaption>
                </figure>
              );
            })}
          </div>
          <blockquote className="story mt-8 max-w-[52ch] border-l border-ink/30 pl-5 text-[19px] leading-[1.55]">{book.pages[0].text}</blockquote>
        </div>

        <div className="rounded-[8px] border border-line bg-card p-5 sm:p-6" id="descargar">
          <h2 className="font-display text-2xl font-medium">Descargar el PDF</h2>
          <p className="mb-6 mt-2 text-ink-soft">Déjanos un email y el cuento se abre listo para imprimir. En el diálogo de impresión, elige «Guardar como PDF».</p>
          <GratisForm />
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="display text-[30px] md:text-[36px]">El mismo libro, con tu hijo como protagonista.</h2>
            <p className="mt-3 max-w-[56ch] text-ink-soft">Su nombre, su edad, cómo es y quién le acompaña. Lo creas en unos minutos.</p>
          </div>
          <Link href="/crear" className="btn-primary justify-self-start">
            Crear el libro
          </Link>
        </div>
      </section>
    </main>
  );
}

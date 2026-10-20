import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { BookCover, Sparkle } from "@/components/brand";
import { WaitlistForm } from "@/components/WaitlistForm";
import { OtherOcasiones } from "@/components/ocasiones/parts";
import { MUESTRA, muestraImage } from "@/lib/muestra";
import { STARTERS } from "@/lib/plan/starters";

export const metadata: Metadata = {
  title: "Lista de espera",
  description: "Estamos a punto de abrir. Déjanos tu email y te avisamos el día que puedas crear su cuento.",
  robots: { index: false, follow: true },
};

/** La idea con la que llegó (desde una ocasión o un botón de la landing): solo su nombre, para el titular. */
async function IdeaForm({ searchParams }: { searchParams: PageProps<"/lista-de-espera">["searchParams"] }) {
  const raw = (await searchParams).idea;
  const s = STARTERS.find((x) => x.id === (Array.isArray(raw) ? raw[0] : raw));
  return (
    <>
      {s && <p className="hand m-0 text-[20px] text-accent">te interesa: {s.label.toLowerCase()}</p>}
      <WaitlistForm idea={s?.id} />
    </>
  );
}

export default function ListaDeEspera({ searchParams }: PageProps<"/lista-de-espera">) {
  return (
    <main className="flex-1">
      <SiteHeader wide />
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-4 pb-20 sm:px-6 md:grid-cols-[1.1fr_1fr] md:gap-14 md:pt-10">
        <div className="grid gap-5">
          <span className="inline-flex items-center gap-2 justify-self-start rounded-full bg-butter px-3.5 py-1.5 text-sm font-semibold">
            <Sparkle size={12} />
            Abrimos muy pronto
          </span>
          <h1 className="display m-0 text-[40px] leading-[1.06] sm:text-[54px]">Estamos terminando los últimos detalles</h1>
          <p className="m-0 max-w-[46ch] text-lg leading-relaxed text-ink-soft">
            Muy pronto podrás crear su cuento: le das la idea en una frase y lo escribimos, lo ilustramos y te lo enviamos en tapa dura. Déjanos tu
            email y te escribimos el día que abramos.
          </p>
          <Suspense fallback={<WaitlistForm />}>
            <IdeaForm searchParams={searchParams} />
          </Suspense>
        </div>
        <div className="mx-auto w-full max-w-[240px] md:max-w-[380px]">
          <BookCover name={MUESTRA.hero} title={MUESTRA.title} from="mamá y papá" src={muestraImage(0)} alt={`Portada de «${MUESTRA.title}», el libro de muestra`} tilt={-2} />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <OtherOcasiones />
      </section>
    </main>
  );
}

/* eslint-disable @next/next/no-img-element -- imágenes estáticas ya optimizadas (WebP) */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BookCover } from "@/components/brand";
import { BookFacts, ClosedNote, InsideBook, StartButton } from "@/components/ocasiones/parts";
import { appOpen } from "@/lib/appOpen";
import { titular } from "@/lib/legal";
import { OCASIONES, OCASIONES_PATH, ocasionPath } from "@/lib/ocasiones";

const TITLE = "Cuentos personalizados para niños, para cada ocasión";
const DESCRIPTION =
  "Cuentos personalizados para Navidad, cumpleaños, el primer día de cole, la llegada de un hermanito o como regalo de los abuelos. Con su nombre, su aspecto y la historia que tú quieras, en tapa dura.";

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · Érase su vez` },
  description: DESCRIPTION,
  alternates: { canonical: OCASIONES_PATH },
  openGraph: { title: TITLE, description: DESCRIPTION, url: OCASIONES_PATH },
};

export default function Ocasiones() {
  const open = appOpen();
  return (
    <main className="flex-1">
      <SiteHeader wide>
        <StartButton open={open} className="btn-primary btn-sm" />
      </SiteHeader>
      <section className="mx-auto grid max-w-6xl gap-5 px-4 pt-4 pb-12 sm:px-6 md:pt-8">
        <h1 className="display m-0 max-w-[20ch] text-[40px] leading-[1.06] sm:text-[54px]">Un cuento personalizado para cada ocasión</h1>
        <p className="m-0 max-w-[56ch] text-lg leading-relaxed text-ink-soft sm:text-xl">
          Su nombre, cómo es y la historia que tú quieras. Estas son las ocasiones que más nos piden; la historia puede ser cualquier otra.
        </p>
        <div className="grid gap-3">
          <div>
            <StartButton open={open} />
          </div>
          <ClosedNote open={open} contact={titular().email ?? "hola@erasesuvez.com"} className="text-ink-soft" />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {OCASIONES.map((o) => (
            <li key={o.slug}>
              <Link href={ocasionPath(o.slug)} className="group grid h-full gap-4 rounded-[24px] bg-card p-5 shadow-[0_2px_0_#e6d8c1] transition-transform hover:-translate-y-1">
                <div className="grid h-[220px] place-items-center rounded-[16px] bg-paper-deep p-4">
                  {o.cover ? (
                    <BookCover name={o.cover.name} title={o.cover.title} src={o.cover.src} alt="" tilt={-2} className="w-[52%] max-w-[150px]" />
                  ) : (
                    <img src="/muestra/hoja-vera.webp" alt="" width={1400} height={939} loading="lazy" className="block aspect-[3/2] w-full max-w-[260px] rounded-sm object-cover shadow-[0_12px_24px_-16px_rgba(35,32,54,0.5)]" />
                  )}
                </div>
                <div>
                  <h2 className="display m-0 text-[22px] group-hover:underline sm:text-[24px]">{o.h1}</h2>
                  <p className="m-0 mt-1.5 leading-relaxed text-ink-soft">{o.lead}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <BookFacts open={open} />
      </section>
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <InsideBook />
      </section>
    </main>
  );
}

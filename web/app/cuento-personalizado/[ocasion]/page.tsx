/* eslint-disable @next/next/no-img-element -- imágenes estáticas ya optimizadas (WebP) */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { BookCover, Sparkle } from "@/components/brand";
import { JsonLd } from "@/components/JsonLd";
import { BookFacts, ClosedNote, Faq, InsideBook, OtherOcasiones, StartButton } from "@/components/ocasiones/parts";
import { appOpen } from "@/lib/appOpen";
import { titular } from "@/lib/legal";
import { OCASIONES, OCASIONES_PATH, ocasion, ocasionPath } from "@/lib/ocasiones";
import { siteUrl } from "@/lib/site";

export function generateStaticParams() {
  return OCASIONES.map((o) => ({ ocasion: o.slug }));
}

export async function generateMetadata({ params }: PageProps<"/cuento-personalizado/[ocasion]">): Promise<Metadata> {
  const o = ocasion((await params).ocasion);
  if (!o) return {};
  return {
    title: { absolute: `${o.metaTitle} · Érase su vez` },
    description: o.description,
    alternates: { canonical: ocasionPath(o.slug) },
    openGraph: { title: o.metaTitle, description: o.description, url: ocasionPath(o.slug), images: o.cover ? [{ url: o.cover.src, alt: `Portada de «${o.cover.title}»` }] : undefined },
  };
}

export default async function OcasionPage({ params }: PageProps<"/cuento-personalizado/[ocasion]">) {
  const o = ocasion((await params).ocasion);
  if (!o) notFound();
  const open = appOpen();
  const base = siteUrl() ?? "https://www.erasesuvez.com";
  return (
    <main className="flex-1">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Érase su vez", item: `${base}/` },
                { "@type": "ListItem", position: 2, name: "Cuentos personalizados", item: `${base}${OCASIONES_PATH}` },
                { "@type": "ListItem", position: 3, name: o.name, item: `${base}${ocasionPath(o.slug)}` },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: o.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
            },
          ],
        }}
      />
      <SiteHeader wide>
        <StartButton open={open} idea={o.starter} className="btn-primary btn-sm" />
      </SiteHeader>

      {/* Portada */}
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-4 pb-16 sm:px-6 md:grid-cols-[1.1fr_1fr] md:gap-14 md:pt-8 md:pb-20">
        <div className="grid gap-5">
          <nav aria-label="Migas" className="text-sm text-ink-soft">
            <Link href="/" className="hover:underline">
              Inicio
            </Link>{" "}
            ·{" "}
            <Link href={OCASIONES_PATH} className="hover:underline">
              Cuentos personalizados
            </Link>{" "}
            · <span aria-current="page">{o.name}</span>
          </nav>
          <h1 className="display m-0 text-[40px] leading-[1.06] sm:text-[54px]">{o.h1}</h1>
          <p className="m-0 max-w-[46ch] text-lg leading-relaxed text-ink-soft sm:text-xl">{o.lead}</p>
          <div className="mt-1 grid gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <StartButton open={open} idea={o.starter} />
              <Link href="/#muestra" className="btn-ghost btn-lg">
                Ver un libro de ejemplo
              </Link>
            </div>
            <ClosedNote open={open} contact={titular().email ?? "hola@erasesuvez.com"} className="text-ink-soft" />
          </div>
        </div>
        <div className="mx-auto w-full max-w-[400px]">
          {o.cover ? (
            <figure className="m-0 grid justify-items-center gap-4">
              <BookCover name={o.cover.name} title={o.cover.title} src={o.cover.src} alt={`Portada de «${o.cover.title}»`} tilt={-2} className="w-[82%]" />
              <figcaption className="hand text-center text-[18px] text-ink-soft">{o.cover.who}</figcaption>
            </figure>
          ) : (
            <figure className="m-0 grid gap-4">
              <div className="relative rotate-[1.5deg] rounded-md bg-white p-2 shadow-[0_18px_36px_-22px_rgba(35,32,54,0.55)]">
                <img src="/muestra/hoja-vera.webp" alt="Así será Vera en el libro, con su perro Toby: varias poses y caras" width={1400} height={939} className="block aspect-[3/2] w-full rounded-sm object-cover" />
                <span aria-hidden className="absolute -top-2.5 left-6 h-[22px] w-16 -rotate-6 bg-star/55" />
              </div>
              <figcaption className="hand text-center text-[18px] text-ink-soft">antes de ilustrar el libro, ves cómo será cada personaje</figcaption>
            </figure>
          )}
        </div>
      </section>

      {/* Ideas */}
      <section className="bg-paper-deep">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <span className="hand text-[22px] text-accent">ideas para empezar</span>
          <h2 className="display m-0 mt-1 max-w-[24ch] text-[30px] sm:text-[40px]">Con una frase basta</h2>
          <p className="m-0 mt-2 max-w-[60ch] text-lg text-ink-soft">Así podría empezar el tuyo. Cámbiale el nombre, añade lo que solo tú sabes y nosotros escribimos las doce páginas.</p>
          <ul className="m-0 mt-8 grid list-none gap-4 p-0 md:grid-cols-2">
            {o.ideas.map((idea) => (
              <li key={idea} className="flex gap-3 rounded-[20px] bg-card px-5 py-4 shadow-[0_2px_0_#e6d8c1]">
                <Sparkle size={14} className="mt-1.5 shrink-0" />
                <p className="story m-0 text-[17px] leading-relaxed">«{idea}»</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Por qué */}
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-20">
        <h2 className="display m-0 text-[30px] sm:text-[40px]">Por qué un cuento suyo</h2>
        <div className="mt-6 grid gap-4 text-lg leading-relaxed text-ink-soft">
          {o.why.map((p) => (
            <p key={p} className="m-0">
              {p}
            </p>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <BookFacts open={open} idea={o.starter} />
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <InsideBook />
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <h2 className="display m-0 mb-6 text-[30px] sm:text-[40px]">Preguntas</h2>
        <Faq items={o.faq} />
        <p className="mt-6 text-sm text-ink-soft">
          Más preguntas en la{" "}
          <Link href="/#preguntas" className="link">
            página principal
          </Link>
          .
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <OtherOcasiones current={o.slug} />
      </section>
    </main>
  );
}

/* eslint-disable @next/next/no-img-element -- imágenes estáticas ya optimizadas (WebP 1400 px) */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { DRY_RUN_PAYMENT } from "@/lib/flags";
import { MUESTRA, muestraImage } from "@/lib/muestra";
import { PRICE_HARDCOVER, PRICE_ILLUSTRATED } from "@/lib/pricing";

export const metadata: Metadata = {
  title: { absolute: "Cuento personalizado para niños, escrito e ilustrado con su historia · cuentos" },
  description:
    "Un cuento personalizado con tu hijo o tu hija de protagonista y la historia que tú quieras: su cumpleaños, un viaje a la Luna o el primer día de cole. Lo escribimos y lo ilustramos; lo lees gratis y lo imprimes en casa.",
};

const STEPS = [
  { n: 1, title: "La idea", body: "Una frase basta: «Vera construye un cohete y viaja a la Luna con su perro». O elige una idea para empezar." },
  { n: 2, title: "Quién", body: "Su nombre, cómo es y quién le acompaña. Sin fotos: lo describes con unos toques." },
  { n: 3, title: "El cuento", body: "Las doce páginas escritas en medio minuto. Cambias lo que quieras, a mano o con una frase." },
  { n: 4, title: "Los personajes", body: "Con tu email te enseñamos la hoja de personajes y la portada. Si algo no encaja, lo pides con palabras." },
  { n: 5, title: "El libro", body: "Las doce ilustraciones, página a página, y el PDF para imprimir en casa." },
];

const EDITIONS = [
  { name: "Cuento y portada · PDF", price: "Gratis", body: "El cuento entero, la hoja de personajes y la portada ilustrada, en un PDF para imprimir en A4.", status: "Disponible" },
  {
    name: "Ilustrado · PDF",
    price: PRICE_ILLUSTRATED,
    body: "Las doce páginas ilustradas con tus personajes. Revisas cada una y tienes una versión más de cada ilustración incluida.",
    status: DRY_RUN_PAYMENT ? "Disponible en prueba" : "Muy pronto",
  },
  { name: "Tapa dura", price: PRICE_HARDCOVER, body: "El libro ilustrado, impreso y encuadernado, enviado a tu casa.", status: "Próximamente" },
];

const HOW = [
  { title: "La historia que tú quieras", body: "Sin catálogo de plantillas: su cumpleaños, la llegada de un hermano, un dragón en el jardín. Si lo puedes contar en una frase, se puede escribir." },
  { title: "El mismo personaje de principio a fin", body: "Antes de pintar fijamos una hoja de personajes. Con ella se le reconoce en las doce páginas, con pijama o con traje de astronauta." },
  { title: "Sin fotos", body: "Describes a tu hijo o a tu hija con rasgos: pelo, piel, ojos, gafas y lo que le hace único. No pedimos fotografías." },
  { title: "Tú tienes la última palabra", body: "Lees el cuento antes de ilustrarlo, cambias cualquier página y revisas cada ilustración antes de imprimir." },
];

const FAQ = [
  {
    q: "¿Quién escribe e ilustra el cuento?",
    a: "Una inteligencia artificial que hemos preparado para escribir e ilustrar cuentos infantiles en castellano, con reglas propias (nada de miedo, marcas ni personajes con derechos) y controles automáticos en cada página. Tú lo lees y lo revisas todo antes de imprimir.",
  },
  {
    q: "¿Qué datos del menor pedís?",
    a: "Su nombre, su edad y cómo es, más lo que tú quieras contar en la historia. No pedimos fotos, apellidos ni fecha de nacimiento.",
  },
  {
    q: "¿Qué hacéis con esos datos?",
    a: "Mientras escribes, todo se queda en tu navegador. Cuando nos das tu email para ver los personajes, guardamos el libro 30 días para que puedas recuperarlo con un enlace; después se borra. Tu email solo se usa para avisos si lo aceptas.",
  },
  {
    q: "¿Cuánto tarda?",
    a: "El cuento escrito, medio minuto. La hoja de personajes y la portada, alrededor de un minuto. Las doce ilustraciones, unos minutos; puedes cerrar la página y volver con el enlace.",
  },
  {
    q: "¿Se puede devolver?",
    a: "Un libro personalizado se hace a medida y no admite desistimiento (art. 103.c TRLGDCU). Si el PDF no se abre o la tapa dura llega dañada, lo reponemos.",
  },
];

const SPREADS = [3, 7, 12];

/** Portadas hechas con el flujo de /crear a partir de las fichas de prueba (docs/ILUSTRACION.md, 13 oct). */
const COVERS = [
  { src: "/muestra/portada-navidad.webp", title: "Daniela y el ruido del tejado", who: "Daniela, 4 años, y su hermano Leo · Nochebuena" },
  { src: "/muestra/portada-cole.webp", title: "Hugo y la mochila de dinosaurio", who: "Hugo, 3 años · primer día de cole" },
  { src: "/muestra/portada-cumpleanos.webp", title: "Lucía y las pistas de la abuela", who: "Lucía, 8 años, y su abuela · su cumpleaños" },
  { src: "/muestra/portada-nubes.webp", title: "Mateo y la torre que tocaba las nubes", who: "Mateo, 5 años, y su gata Misu · «Sorpréndeme»" },
];

export default function Landing() {
  return (
    <main className="flex-1">
      <SiteHeader wide>
        <Link href="/crear" className="btn-primary btn-sm">
          Crear el libro
        </Link>
      </SiteHeader>

      {/* Portada */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-8 sm:px-6 md:grid-cols-[5fr_6fr] md:items-center md:gap-14 md:pb-24 md:pt-14">
        <div>
          <h1 className="display text-[44px] md:text-[64px]" style={{ fontVariationSettings: '"opsz" 144' }}>
            Un libro escrito y pintado para un solo lector.
          </h1>
          <p className="mt-6 max-w-[38ch] text-lg leading-relaxed text-ink-soft">Cuéntanos la historia que quieras, con una frase. La escribimos y la ilustramos con tu hijo o tu hija de protagonista.</p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link href="/crear" className="btn-primary">
              Crear el libro
            </Link>
            <a href="#muestra" className="link text-[15px]">
              Ver un libro de muestra
            </a>
          </div>
          <p className="mt-6 text-sm text-ink-soft">El cuento y la portada son gratis. El libro ilustrado se imprime en casa; pronto, también en tapa dura.</p>
        </div>
        <figure className="-mx-4 sm:mx-0">
          <div className="relative overflow-hidden sm:rounded-[8px] shadow-[0_1px_2px_rgba(31,26,23,0.1),0_12px_32px_-12px_rgba(31,26,23,0.35)]">
            <img src={muestraImage(0)} alt={`Portada de «${MUESTRA.title}»: Vera y su perro Toby vuelan en un cohete de cartón hacia la Luna`} width={1400} height={939} className="block aspect-[3/2] w-full object-cover" fetchPriority="high" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[rgba(15,20,40,0.45)] to-transparent" />
            <p className="display absolute left-5 right-5 top-4 text-[28px] text-[#fbf3df] sm:left-7 sm:top-6 sm:text-[40px]" style={{ textShadow: "0 2px 14px rgba(10,20,50,.55)" }}>
              {MUESTRA.title}
            </p>
          </div>
          <figcaption className="mt-3 px-4 text-sm text-ink-soft sm:px-0">
            Portada del libro de muestra, hecho con esta frase: «{MUESTRA.idea}»
          </figcaption>
        </figure>
      </section>

      {/* Cómo se hace */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="display text-[32px] md:text-[40px]">Cómo se hace</h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-5 md:gap-8">
            {STEPS.map((s) => (
              <li key={s.n} className="grid grid-cols-[2.5rem_1fr] gap-x-2 md:block">
                <span className="display text-[40px] leading-none italic text-ink-soft/70" aria-hidden>
                  {s.n}
                </span>
                <div className="md:mt-4">
                  <h3 className="font-display text-xl font-medium">{s.title}</h3>
                  <p className="mt-2 max-w-[38ch] leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link href="/crear" className="btn-primary mt-12">
            Empezar
          </Link>
        </div>
      </section>

      {/* Muestra */}
      <section className="border-t border-line bg-paper-deep" id="muestra">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="display text-[32px] md:text-[40px]">Un libro de muestra</h2>
          <p className="mt-3 max-w-[62ch] leading-relaxed text-ink-soft">
            «{MUESTRA.title}»: doce páginas y la portada, con Vera igual en todas, con pijama, con peto o con traje de astronauta. Cada página es una ilustración y su texto debajo, en A4.
          </p>
          <div className="mt-10 grid gap-12 md:grid-cols-3 md:gap-8">
            {SPREADS.map((n) => (
              <figure key={n} className="grid content-start gap-4 bg-[#fbf7ef] pb-6 shadow-[0_1px_2px_rgba(31,26,23,0.1),0_16px_40px_-16px_rgba(31,26,23,0.3)]">
                <img src={muestraImage(n)} alt={`Página ${n} del libro de muestra`} width={1400} height={939} loading="lazy" className="block aspect-[3/2] w-full object-cover" />
                <figcaption className="story px-6 text-[17px] leading-relaxed">
                  {MUESTRA.pages[n - 1].split("\n").map((l, i) => (
                    <p key={i} className="mb-2">
                      {l}
                    </p>
                  ))}
                  <span className="mt-2 block text-center font-sans text-xs tracking-[0.12em] text-ink-soft">{n}</span>
                </figcaption>
              </figure>
            ))}
          </div>
          <h3 className="mt-16 font-display text-2xl">Otras portadas</h3>
          <p className="mt-2 max-w-[62ch] leading-relaxed text-ink-soft">Hechas con el mismo proceso, cada una a partir de una frase y unos rasgos. Ningún niño se parece a otro y ninguna historia es una plantilla.</p>
          <ul className="mt-6 grid gap-6 sm:grid-cols-2">
            {COVERS.map((c) => (
              <li key={c.src}>
                <figure>
                  <div className="relative overflow-hidden rounded-[6px] shadow-[0_1px_2px_rgba(31,26,23,0.1),0_10px_24px_-12px_rgba(31,26,23,0.3)]">
                    <img src={c.src} alt={`Portada de «${c.title}»`} width={1000} height={671} loading="lazy" className="block aspect-[3/2] w-full object-cover" />
                    <div aria-hidden className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-[rgba(15,20,40,0.5)] to-transparent" />
                    <p className="display absolute left-4 right-4 top-3 text-[22px] text-[#fbf3df]" style={{ textShadow: "0 2px 12px rgba(10,20,50,.6)" }}>
                      {c.title}
                    </p>
                  </div>
                  <figcaption className="mt-2 text-sm text-ink-soft">{c.who}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
          <h3 className="mt-16 font-display text-2xl">Más páginas del libro de Vera</h3>
          <div className="mt-6 flex flex-wrap gap-2" aria-label="Más páginas del libro de muestra">
            {[1, 2, 4, 5, 6, 8, 9, 10, 11].map((n) => (
              <img key={n} src={muestraImage(n)} alt={`Página ${n}`} width={140} height={94} loading="lazy" className="h-[60px] w-[90px] rounded-[4px] object-cover sm:h-[94px] sm:w-[140px]" />
            ))}
          </div>
        </div>
      </section>

      {/* Ediciones */}
      <section className="border-t border-line" id="ediciones">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="display text-[32px] md:text-[40px]">Ediciones</h2>
          <ul className="mt-10 border-t border-ink/80">
            {EDITIONS.map((e) => (
              <li key={e.name} className="grid gap-x-8 gap-y-2 border-b border-line py-6 md:grid-cols-[14rem_1fr_10rem] md:items-baseline">
                <div className="flex items-baseline justify-between gap-4 md:block">
                  <h3 className="font-display text-xl font-medium">{e.name}</h3>
                  <span className="font-display text-lg md:hidden">{e.price}</span>
                </div>
                <div>
                  <p className="max-w-[56ch] leading-relaxed text-ink-soft">{e.body}</p>
                  <p className="mt-1 text-sm text-ink-soft/80">{e.status}</p>
                </div>
                <span className="hidden text-right font-display text-xl md:block">{e.price}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-soft">Precios con IVA incluido.</p>
        </div>
      </section>

      {/* Cómo lo hacemos */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="display text-[32px] md:text-[40px]">Cómo lo hacemos</h2>
          <dl className="mt-10 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {HOW.map((h) => (
              <div key={h.title} className="border-t border-line pt-5">
                <dt className="font-display text-xl font-medium">{h.title}</dt>
                <dd className="mt-2 max-w-[52ch] leading-relaxed text-ink-soft">{h.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Preguntas */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-24">
          <h2 className="display text-[32px] md:text-[40px]">Preguntas</h2>
          <div className="mt-8 border-t border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group border-b border-line py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-lg font-medium [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-ink-soft transition-transform group-open:rotate-45" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-[64ch] leading-relaxed text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-sm text-ink-soft">
            Más detalle en la{" "}
            <Link href="/privacidad" className="link">
              política de privacidad
            </Link>{" "}
            y las{" "}
            <Link href="/condiciones" className="link">
              condiciones
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}

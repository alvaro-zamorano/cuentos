/* eslint-disable @next/next/no-img-element -- imágenes estáticas ya optimizadas (WebP 1400 px) */
import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { BookCover, Blob, Hills, Icon, Moon, Sparkle } from "@/components/brand";
import { SampleFlipper } from "@/components/landing/SampleFlipper";
import { paymentMode } from "@/lib/stripe";
import { MUESTRA, muestraImage } from "@/lib/muestra";
import { PRICE_HARDCOVER, PRICE_ILLUSTRATED } from "@/lib/pricing";

export const metadata: Metadata = {
  title: { absolute: "Cuento personalizado para niños, escrito e ilustrado con su historia · cuentos" },
  description:
    "Un cuento personalizado con tu hijo o tu hija de protagonista y la historia que tú quieras: su cumpleaños, un viaje a la Luna o el primer día de cole. Lo escribimos y lo ilustramos; lo lees gratis y lo imprimes en casa.",
};

/** Portadas hechas con el flujo de /crear a partir de las fichas de prueba (docs/ILUSTRACION.md, 13 oct). */
const COVERS = [
  { src: "/muestra/portada-navidad.webp", title: "Daniela y el ruido del tejado", name: "Daniela", who: "Daniela, 4 años · Nochebuena", tilt: -2 },
  { src: "/muestra/portada-cole.webp", title: "Hugo y la mochila de dinosaurio", name: "Hugo", who: "Hugo, 3 años · primer día de cole", tilt: 1.5 },
  { src: "/muestra/portada-cumpleanos.webp", title: "Lucía y las pistas de la abuela", name: "Lucía", who: "Lucía, 8 años · su cumpleaños", tilt: -1 },
  { src: "/muestra/portada-nubes.webp", title: "Mateo y la torre que tocaba las nubes", name: "Mateo", who: "Mateo, 5 años · «Sorpréndeme»", tilt: 2 },
];

/** Ideas de arranque que llevan a /crear con la idea puesta (lib/plan/starters.ts). */
const STARTS = [
  { id: "cumpleanos", label: "Su cumpleaños", icon: Icon.cake },
  { id: "navidad", label: "Navidad", icon: Icon.tree },
  { id: "reyes", label: "Noche de Reyes", icon: Icon.star },
  { id: "cole", label: "Primer día de cole", icon: Icon.bag },
  { id: "hermanito", label: "Llega un hermanito", icon: Icon.heart },
  { id: "dientes", label: "Se le cae un diente", icon: Icon.tooth },
  { id: "luna", label: "Viaje a la Luna", icon: Icon.moon },
];

const STEPS = [
  { n: 1, title: "Nos cuentas la idea", body: "Con una frase basta. O eliges una para empezar: su cumpleaños, Navidad, un viaje a la Luna.", tint: "bg-peach" },
  { n: 2, title: "Conoces a los personajes", body: "Antes de pintar te enseñamos su hoja de personajes y la portada. Si algo no encaja, lo pides con palabras.", tint: "bg-sky" },
  { n: 3, title: "Tienes su libro", body: "Doce páginas ilustradas que revisas una a una, en un PDF para imprimir en casa. Puedes cerrar la página y volver con tu enlace.", tint: "bg-butter" },
];

const HOW = [
  { title: "La historia que tú quieras", body: "Sin catálogo de plantillas: su cumpleaños, la llegada de un hermano o un dragón en el jardín.", tint: "bg-peach", icon: Icon.feather },
  { title: "Igual en las doce páginas", body: "Antes de pintar fijamos su hoja de personajes. Con ella se le reconoce en todo el libro.", tint: "bg-sky", icon: Icon.people },
  { title: "Sin fotos", body: "Lo describes con unos toques: pelo, piel, ojos, gafas y lo que le hace único.", tint: "bg-butter", icon: Icon.nocamera },
  { title: "Tú das el visto bueno", body: "Lees el cuento antes de ilustrarlo y revisas cada página antes de imprimir.", tint: "bg-sage", icon: Icon.approve },
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

const CHECK = <Icon.check size={18} className="shrink-0 text-star" />;

export default function Landing() {
  // se fija al construir la página (estática): Stripe configurado → disponible
  const illustratedStatus = { stripe: null, "dry-run": "Disponible en prueba", none: "Muy pronto" }[paymentMode()];
  return (
    <main className="flex-1">
      {/* Portada en noche */}
      <section className="relative overflow-hidden bg-night text-moon">
        <SiteHeader wide night>
          <nav aria-label="Principal" className="flex items-center gap-7">
            <div className="hidden items-center gap-7 text-[15px] font-medium text-[#d9deec] md:flex">
              <a href="#como" className="hover:text-moon">
                Cómo funciona
              </a>
              <a href="#muestra" className="hover:text-moon">
                Libro de muestra
              </a>
              <a href="#ediciones" className="hover:text-moon">
                Precios
              </a>
              <a href="#preguntas" className="hover:text-moon">
                Preguntas
              </a>
            </div>
            <Link href="/crear" className="btn-primary btn-sm">
              Crear su cuento
            </Link>
          </nav>
        </SiteHeader>
        <Sparkle className="twinkle absolute top-[14%] left-[5%]" size={22} />
        <Sparkle className="twinkle-slow absolute top-[38%] left-[48%] hidden md:block" size={12} color="var(--moon)" />
        <Sparkle className="twinkle absolute top-[16%] right-[8%]" size={14} color="var(--moon)" />
        <Moon className="absolute top-[12%] right-[30%] hidden opacity-90 lg:block" size={70} />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-36 sm:px-6 md:grid-cols-[1.05fr_1fr] md:gap-14 md:pt-14 md:pb-44">
          <div className="grid gap-6">
            <span className="inline-flex items-center gap-2 justify-self-start rounded-full border border-star/40 bg-star/15 px-3.5 py-1.5 text-sm font-semibold text-star">
              <Sparkle size={12} />
              El cuento y la portada, gratis
            </span>
            <h1 className="display m-0 text-[44px] leading-[1.04] text-moon sm:text-[58px] lg:text-[74px]">
              Un libro escrito y pintado para <span className="text-star">un solo lector.</span>
            </h1>
            <p className="m-0 max-w-[34ch] text-lg leading-relaxed text-moon-soft sm:text-xl">Cuéntanos la historia con una frase. La escribimos y la ilustramos con tu hijo o tu hija de protagonista, igual en las doce páginas.</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <Link href="/crear" className="btn-primary btn-lg">
                Crear su cuento <Icon.arrow size={20} />
              </Link>
              <a href="#muestra" className="btn-moon btn-lg">
                Hojear el libro de Vera
              </a>
            </div>
            <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-[15px] text-[#b9c1da]">
              <li className="flex items-center gap-2">{CHECK}Sin fotos del menor</li>
              <li className="flex items-center gap-2">{CHECK}Lo lees antes de pagar</li>
              <li className="flex items-center gap-2">{CHECK}PDF para imprimir en casa</li>
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-[460px] pb-28 sm:pb-32">
            <div aria-hidden className="absolute top-12 -right-4 hidden w-[62%] rotate-[8deg] overflow-hidden rounded-[10px] bg-[#fbf6ec] shadow-[0_30px_60px_-30px_rgba(5,10,30,0.8)] sm:block">
              <img src={muestraImage(3)} alt="" width={1400} height={939} className="block aspect-[3/2] w-full object-cover" />
              <p className="story m-0 px-4 pt-3 pb-5 text-[12px] leading-relaxed text-[#3a3346]">Al atardecer, Vera se puso su traje de astronauta, el blanco con rayas amarillas. A Toby le tocó un casco de burbuja hecho a su medida.</p>
            </div>
            <div className="floaty relative mx-auto w-[78%] sm:mx-0 sm:w-[82%]">
              <BookCover name={MUESTRA.hero} title={MUESTRA.title} from="mamá y papá" src={muestraImage(0)} alt={`Portada de «${MUESTRA.title}»: Vera y su perro Toby vuelan en un cohete de cartón hacia la Luna`} />
            </div>
            <div className="absolute bottom-0 left-0 w-[72%] max-w-[290px] rotate-[2.5deg] rounded-[20px] bg-card px-4 pt-3.5 pb-4 text-ink shadow-[0_24px_50px_-22px_rgba(5,10,30,0.75)] sm:-left-4">
              <p className="hand m-0 mb-1 text-[19px] leading-tight text-accent">hecho con esta frase:</p>
              <p className="m-0 text-[14.5px] leading-snug">«{MUESTRA.idea}»</p>
            </div>
          </div>
        </div>
        <Hills className="absolute -bottom-px left-0 h-[70px] sm:h-[90px]" />
      </section>

      {/* Cómo se hace */}
      <section id="como" className="mx-auto max-w-6xl scroll-mt-6 px-4 pt-14 pb-20 sm:px-6 md:pt-20 md:pb-24">
        <div className="grid justify-items-center gap-2 text-center">
          <span className="hand text-[22px] text-accent">así se hace</span>
          <h2 className="display m-0 max-w-[18ch] text-[36px] sm:text-[52px]">De una frase a un libro, en tres pasos.</h2>
        </div>
        <ol className="m-0 mt-12 grid list-none gap-10 p-0 md:grid-cols-3 md:gap-7">
          {STEPS.map((s) => (
            <li key={s.n} className="reveal grid content-start gap-5">
              <div className={`grid h-[230px] place-items-center rounded-[28px] p-6 sm:h-[250px] ${s.tint}`}>{s.n === 1 ? <IdeaCard /> : s.n === 2 ? <SheetCard /> : <PagesCard />}</div>
              <div className="flex items-start gap-3.5">
                <span className="display grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-[21px] text-white">{s.n}</span>
                <div>
                  <h3 className="display m-0 mt-0.5 mb-1.5 text-[24px] sm:text-[26px]">{s.title}</h3>
                  <p className="m-0 leading-relaxed text-ink-soft">{s.body}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-center">
          <Link href="/crear" className="btn-primary btn-lg">
            Empezar su cuento
          </Link>
          <span className="text-[15px] text-ink-soft">Los pasos 1 y 2 son gratis. Pagas solo si quieres el libro ilustrado.</span>
        </div>
      </section>

      {/* Libro de muestra */}
      <section id="muestra" className="relative scroll-mt-6 overflow-hidden bg-paper-deep">
        <Blob className="pointer-events-none absolute -top-16 -right-32 h-[390px] w-[520px] opacity-80" />
        <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
          <div className="max-w-[640px]">
            <span className="hand text-[22px] text-accent">el libro de muestra</span>
            <h2 className="display m-0 mt-1 mb-3 text-[36px] sm:text-[52px]">Hojea el libro de Vera.</h2>
            <p className="m-0 text-lg text-ink-soft">
              «{MUESTRA.title}»: doce páginas y la portada, con Vera igual en todas, en pijama, con peto o con traje de astronauta. Hecho con una frase: «{MUESTRA.idea}»
            </p>
          </div>
          <div className="mt-6">
            <SampleFlipper />
          </div>
        </div>
      </section>

      {/* Otras portadas */}
      <section className="mx-auto max-w-6xl px-4 pt-20 pb-10 sm:px-6 md:pt-24">
        <div className="grid justify-items-center gap-2 text-center">
          <span className="hand text-[22px] text-accent">cada niño, su historia</span>
          <h2 className="display m-0 max-w-[20ch] text-[36px] sm:text-[52px]">Ninguna portada se parece a otra.</h2>
          <p className="m-0 mt-1 max-w-[52ch] text-lg text-ink-soft">Hechas con el mismo proceso, cada una a partir de una frase y unos rasgos. No hay plantillas.</p>
        </div>
        <ul className="m-0 mt-12 grid list-none grid-cols-2 gap-x-6 gap-y-10 p-0 lg:grid-cols-4">
          {COVERS.map((c) => (
            <li key={c.src} className="reveal grid justify-items-center gap-3.5">
              <BookCover name={c.name} title={c.title} src={c.src} alt={`Portada de «${c.title}»`} tilt={c.tilt} className="w-full max-w-[250px] transition-transform duration-300 hover:-translate-y-1" />
              <span className="hand text-center text-[17px] text-ink-soft sm:text-[18px]">{c.who}</span>
            </li>
          ))}
        </ul>
        <div className="mt-16 grid justify-items-center gap-4">
          <p className="display m-0 text-[22px] sm:text-[24px]">¿Por dónde empezamos?</p>
          <div className="flex max-w-[860px] flex-wrap justify-center gap-2.5">
            {STARTS.map((s) => (
              <Link key={s.id} href={`/crear?idea=${s.id}`} className="chip transition-transform hover:-translate-y-0.5">
                <s.icon size={18} className="text-accent" />
                {s.label}
              </Link>
            ))}
            <Link href="/crear" className="chip chip-on transition-transform hover:-translate-y-0.5">
              <Sparkle size={15} />
              Sorpréndeme
            </Link>
          </div>
        </div>
      </section>

      {/* Cómo lo hacemos */}
      <section className="mx-auto max-w-6xl px-4 pt-14 pb-20 sm:px-6 md:pb-24">
        <h2 className="display m-0 mb-8 text-center text-[30px] sm:text-[36px]">Cómo lo hacemos</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {HOW.map((h) => (
            <div key={h.title} className={`reveal grid content-start gap-3 rounded-[28px] px-6 pt-7 pb-8 ${h.tint}`}>
              <span className="grid h-13 w-13 place-items-center rounded-full bg-card">
                <h.icon size={26} />
              </span>
              <h3 className="display m-0 mt-1 text-[22px] sm:text-[23px]">{h.title}</h3>
              <p className="m-0 text-[16px] leading-relaxed text-[#3f384f]">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Ediciones */}
      <section id="ediciones" className="scroll-mt-6 bg-paper-deep">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
          <div className="grid justify-items-center gap-2 text-center">
            <span className="hand text-[22px] text-accent">ediciones</span>
            <h2 className="display m-0 max-w-[22ch] text-[34px] sm:text-[48px]">Empiezas gratis. Pagas solo por el libro ilustrado.</h2>
          </div>
          <div className="mt-12 grid items-stretch gap-6 md:grid-cols-3 md:gap-5">
            <div className="flex flex-col gap-5 rounded-[28px] bg-card px-7 py-8 shadow-[0_2px_0_#e6d8c1]">
              <div>
                <p className="m-0 text-[15px] font-bold text-ink-soft">Cuento y portada · PDF</p>
                <p className="display m-0 mt-1.5 text-[44px] leading-none">Gratis</p>
              </div>
              <ul className="m-0 grid list-none gap-2.5 p-0 text-[16px]">
                {["El cuento completo, escrito para él o ella", "Su hoja de personajes y la portada ilustrada", "PDF en A4 con la portada y el texto"].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <Icon.check size={20} className="mt-0.5 shrink-0 text-accent" />
                    {x}
                  </li>
                ))}
              </ul>
              <Link href="/crear" className="btn-ghost mt-auto w-full">
                Empezar gratis
              </Link>
            </div>

            <div className="relative flex flex-col gap-5 rounded-[28px] bg-night px-7 py-8 text-moon shadow-[0_40px_70px_-40px_rgba(29,39,71,0.9)]">
              <span className="absolute -top-3.5 right-6 inline-flex items-center gap-1.5 rounded-full bg-star px-3.5 py-1.5 text-[13px] font-bold text-ink">
                <Sparkle size={12} color="var(--ink)" />
                Doce ilustraciones
              </span>
              <div>
                <p className="m-0 text-[15px] font-bold text-[#b9c1da]">Ilustrado · PDF</p>
                <p className="display m-0 mt-1.5 text-[44px] leading-none">{PRICE_ILLUSTRATED}</p>
              </div>
              <ul className="m-0 grid list-none gap-2.5 p-0 text-[16px] text-[#e4e8f2]">
                {["Todo lo gratis", "Las doce páginas ilustradas con sus personajes", "Una versión más de cada ilustración, incluida", "PDF en A4 para imprimir en casa"].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <Icon.check size={20} className="mt-0.5 shrink-0 text-star" />
                    {x}
                  </li>
                ))}
              </ul>
              {illustratedStatus && <p className="m-0 text-sm text-moon-soft">{illustratedStatus}</p>}
              <Link href="/crear" className="btn-primary mt-auto w-full">
                Crear su cuento
              </Link>
            </div>

            <div className="flex flex-col gap-5 rounded-[28px] bg-card px-7 py-8 shadow-[0_2px_0_#e6d8c1]">
              <div>
                <p className="m-0 text-[15px] font-bold text-ink-soft">Tapa dura</p>
                <p className="display m-0 mt-1.5 text-[44px] leading-none">
                  {PRICE_HARDCOVER.startsWith("desde ") ? (
                    <>
                      <span className="text-xl font-medium italic">desde </span>
                      {PRICE_HARDCOVER.slice(6)}
                    </>
                  ) : (
                    PRICE_HARDCOVER
                  )}
                </p>
              </div>
              <p className="m-0 text-[16px] text-ink-soft">El libro ilustrado, impreso y encuadernado, enviado a tu casa.</p>
              <span className="mt-auto inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#efe4d0] font-bold text-ink-soft">Próximamente</span>
            </div>
          </div>
          <p className="m-0 mt-5 text-center text-sm text-ink-soft">Precios con IVA incluido.</p>
        </div>
      </section>

      {/* Preguntas */}
      <section id="preguntas" className="mx-auto max-w-3xl scroll-mt-6 px-4 pt-20 pb-16 sm:px-6 md:pt-24">
        <h2 className="display m-0 mb-8 text-center text-[34px] sm:text-[48px]">Preguntas</h2>
        <div className="grid gap-3">
          {FAQ.map((f, i) => (
            <details key={f.q} className="group rounded-[20px] bg-card px-5 py-4 shadow-[0_2px_0_#eaddc6] sm:px-6 sm:py-5" open={i === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-[18px] font-semibold sm:text-[20px] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-paper-deep text-ink transition-transform group-open:rotate-45 group-open:bg-peach">
                  +
                </span>
              </summary>
              <p className="m-0 mt-3 max-w-[64ch] leading-relaxed text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-ink-soft">
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
      </section>

      {/* Cierre */}
      <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <div className="relative grid justify-items-center gap-4 overflow-hidden rounded-[32px] bg-night px-6 py-14 text-center text-moon sm:rounded-[36px] sm:py-18">
          <Moon className="absolute top-6 right-6 sm:top-9 sm:right-auto sm:left-[8%]" size={52} />
          <Sparkle className="twinkle absolute top-[30%] right-[12%]" size={18} />
          <Sparkle className="twinkle-slow absolute bottom-[22%] left-[16%]" size={12} color="var(--moon)" />
          <h2 className="display m-0 max-w-[18ch] text-[34px] sm:text-[58px]">
            Su cuento, <span className="text-star">esta misma noche.</span>
          </h2>
          <p className="m-0 max-w-[44ch] text-lg text-moon-soft">Una frase, su nombre y unos rasgos. Lo demás lo hacemos nosotros.</p>
          <Link href="/crear" className="btn-primary btn-lg mt-2">
            Crear su cuento
          </Link>
          <span className="hand text-[19px] text-star">gratis hasta la portada</span>
        </div>
      </section>
    </main>
  );
}

/** Paso 1 dibujado: la idea a medio escribir. */
function IdeaCard() {
  return (
    <div className="w-full max-w-[290px] -rotate-[1.5deg] rounded-[18px] bg-card p-4 shadow-[0_18px_36px_-22px_rgba(35,32,54,0.5)]">
      <p className="m-0 mb-2 text-[12px] font-bold tracking-[0.08em] text-mute uppercase">¿De qué va?</p>
      <p className="story m-0 text-[17px] leading-snug">
        Vera construye un cohete con una caja de cartón
        <span className="ml-0.5 inline-block h-[18px] w-0.5 translate-y-[3px] bg-accent" />
      </p>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-soft">Su cumpleaños</span>
        <span className="rounded-full bg-ink px-2.5 py-1 text-[12px] font-semibold text-paper">Viaje a la Luna</span>
        <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-soft">Navidad</span>
      </div>
    </div>
  );
}

/** Paso 2 dibujado: la hoja de personajes pegada con cinta. */
function SheetCard() {
  return (
    <div className="relative w-full max-w-[300px] rotate-[1.5deg] rounded-md bg-white p-2 shadow-[0_18px_36px_-22px_rgba(35,32,54,0.55)]">
      <img src="/muestra/hoja-vera.webp" alt="Hoja de personajes de Vera y su perro Toby" width={1400} height={939} loading="lazy" className="block aspect-[3/2] w-full rounded-sm object-cover" />
      <span aria-hidden className="absolute -top-2.5 left-6 h-[22px] w-16 -rotate-6 bg-star/55" />
      <span aria-hidden className="absolute -top-2 right-7 h-[22px] w-14 rotate-[5deg] bg-star/55" />
    </div>
  );
}

/** Paso 3 dibujado: dos páginas del libro (A4: ilustración arriba, texto debajo). */
function PagesCard() {
  const page = (n: number, rot: string, extra = "") => (
    <div className={`w-[46%] max-w-[156px] overflow-hidden rounded-[3px_8px_8px_3px] bg-[#fbf6ec] shadow-[3px_3px_0_#eaddc6,0_18px_36px_-18px_rgba(35,32,54,0.6)] ${rot} ${extra}`}>
      <img src={muestraImage(n)} alt="" width={1400} height={939} loading="lazy" className="block aspect-[3/2] w-full object-cover" />
      <p className="story m-0 line-clamp-5 px-3 pt-2.5 pb-4 text-[8.5px] leading-normal text-[#3a3346]">{MUESTRA.pages[n - 1]}</p>
    </div>
  );
  return (
    <div className="flex w-full items-start justify-center">
      {page(5, "-rotate-3")}
      {page(9, "rotate-[4deg]", "-ml-[8%] mt-[8%]")}
    </div>
  );
}
